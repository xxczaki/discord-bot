import { openai } from '@ai-sdk/openai';
import {
	InvalidArgumentError,
	NoSuchToolError,
	stepCountIs,
	streamText,
} from 'ai';
import type { ChatInputCommandInteraction } from 'discord.js';
import logger from '../utils/logger';
import {
	generateErrorMessage,
	generateSuccessMessage,
	generateSystemPrompt,
	getAvailableTools,
	type ToolContext,
	type ToolResult,
} from '../utils/promptTools';
import { RateLimiter } from '../utils/RateLimiter';
import useQueueWithValidation from '../utils/useQueueWithValidation';

const rateLimiter = RateLimiter.getInstance('prompt-command', 100, 24);

export default async function promptCommandHandler(
	interaction: ChatInputCommandInteraction,
) {
	const apiKey = process.env.OPENAI_API_KEY;

	if (!apiKey) {
		return interaction.reply({
			content: 'The `/prompt` command is not available.',
			flags: ['Ephemeral'],
		});
	}

	const queue = useQueueWithValidation(interaction, {
		message: 'The queue is empty. Cannot process prompt.',
	});

	if (!queue) return;

	if (!rateLimiter.canMakeCall()) {
		return interaction.reply({
			content:
				'Daily rate limit reached (100 calls per day). Try again tomorrow.',
			flags: ['Ephemeral'],
		});
	}

	const prompt = interaction.options.getString('prompt', true);

	await interaction.reply('Analyzing queue…');

	try {
		const tracks = queue.tracks.toArray();
		const currentTrack = queue.currentTrack;

		const toolContext: ToolContext = {
			queue,
			currentTrackTitle: currentTrack?.title ?? 'None',
			currentTrackAuthor: currentTrack?.author ?? 'N/A',
			trackCount: tracks.length,
		};

		const queueData = tracks.map((track, index) => ({
			index,
			title: track.title,
			author: track.author,
			duration: track.duration,
		}));

		const result = streamText({
			model: openai('gpt-4o-mini'),
			system: generateSystemPrompt(toolContext),
			prompt: `User request: "${prompt}"\n\nQueue data: ${JSON.stringify(queueData)}`,
			tools: getAvailableTools(toolContext),
			stopWhen: stepCountIs(5),
			maxRetries: 2,
			temperature: 0.1,
		});

		rateLimiter.incrementCall();

		const completedActions: string[] = [];

		const formatOutput = () => {
			return completedActions.join('\n');
		};

		const pendingTools = new Map<string, string>();

		for await (const part of result.fullStream) {
			if (part.type === 'tool-call') {
				pendingTools.set(part.toolCallId, part.toolName);
			} else if (part.type === 'tool-result') {
				const output = 'output' in part ? part.output : undefined;
				const result = output as ToolResult | undefined;

				const toolName = pendingTools.get(part.toolCallId);
				if (!toolName) continue;

				const isSuccess = result?.success !== false;
				let completedMessage: string;

				if (!isSuccess) {
					const errorMsg = generateErrorMessage(toolName, result ?? {});
					completedMessage = `❌ ${errorMsg}`;
					logger.error({ toolName, result }, '[Prompt] Tool execution failed');
				} else {
					const successMsg = generateSuccessMessage(toolName, result ?? {});
					completedMessage = `✅ ${successMsg}`;
				}

				// Add completed message to history (keep pending message too)
				completedActions.push(completedMessage);
				pendingTools.delete(part.toolCallId);

				// Update immediately when a tool completes
				await interaction.editReply(formatOutput());
			} else if (part.type === 'error') {
				logger.error(
					{ error: 'error' in part ? part.error : 'Unknown error' },
					'[Prompt] Stream error',
				);
			}
		}

		if (completedActions.length === 0) {
			return interaction.editReply(
				'❌ No actions were performed. The request might not match any tracks in the queue.',
			);
		}
	} catch (error) {
		if (NoSuchToolError.isInstance(error)) {
			await interaction.editReply({
				content: `Tool not found: ${error.message}`,
			});
		} else if (InvalidArgumentError.isInstance(error)) {
			await interaction.editReply({
				content: `Invalid arguments: ${error.message}`,
			});
		} else {
			await interaction.editReply({
				content:
					error instanceof Error
						? error.message
						: 'An error occurred while processing your request.',
			});
		}
	}
}
