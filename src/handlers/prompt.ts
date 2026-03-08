import {
	type OpenAILanguageModelResponsesOptions,
	openai,
} from '@ai-sdk/openai';
import { stepCountIs, streamText } from 'ai';
import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import logger from '../utils/logger';
import {
	formatToolArgs,
	generateSuccessMessage,
	generateSystemPrompt,
	getAvailableTools,
	OPENAI_PROVIDER_OPTIONS,
	PROMPT_MODEL_ID,
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

	const embed = new EmbedBuilder()
		.setTitle('Prompt')
		.setColor('Blue')
		.setDescription('Analyzing queue…');
	await interaction.reply({ embeds: [embed] });

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
			model: openai(PROMPT_MODEL_ID),
			system: generateSystemPrompt(toolContext),
			prompt: `User request: "${prompt}"\n\nQueue data: ${JSON.stringify(queueData)}`,
			tools: getAvailableTools(toolContext),
			stopWhen: stepCountIs(5),
			maxRetries: 2,
			providerOptions: {
				openai: {
					...OPENAI_PROVIDER_OPTIONS,
					reasoningEffort: 'low',
				} satisfies OpenAILanguageModelResponsesOptions,
			},
		});

		rateLimiter.incrementCall();

		const completedActions: string[] = [];

		const pendingTools = new Map<string, string>();

		for await (const part of result.fullStream) {
			if (part.type === 'tool-call') {
				pendingTools.set(part.toolCallId, part.toolName);
			} else if (part.type === 'tool-result') {
				const output = 'output' in part ? part.output : undefined;
				const toolResult = output as ToolResult | undefined;
				const input = ('input' in part ? part.input : undefined) as
					| Record<string, unknown>
					| undefined;

				const toolName = pendingTools.get(part.toolCallId);
				if (!toolName) continue;

				const successMsg = generateSuccessMessage(toolName, toolResult ?? {});
				const formattedArgs = input ? formatToolArgs(input) : undefined;
				const line = formattedArgs
					? `✅ ${successMsg} (${formattedArgs})`
					: `✅ ${successMsg}`;
				completedActions.push(line);
				pendingTools.delete(part.toolCallId);

				embed.setDescription(completedActions.join('\n'));
				await interaction.editReply({ embeds: [embed] });
			} else if (part.type === 'error') {
				/* v8 ignore start */
				const streamError = 'error' in part ? part.error : 'Unknown error';
				/* v8 ignore stop */
				logger.error({ error: streamError }, '[Prompt] Stream error');
			}
		}

		const { inputTokens, outputTokens } = await result.totalUsage;
		const totalTokens = (inputTokens ?? 0) + (outputTokens ?? 0);

		if (completedActions.length === 0) {
			embed
				.setTitle('❌ Prompt')
				.setColor('Red')
				.setDescription(
					'No actions were performed. The request might not match any tracks in the queue.',
				)
				.setFooter({
					text: `${PROMPT_MODEL_ID} · ${totalTokens.toLocaleString()} tokens`,
				});
		} else {
			embed
				.setTitle('✅ Prompt')
				.setColor('Green')
				.setFooter({
					text: `${PROMPT_MODEL_ID} · ${totalTokens.toLocaleString()} tokens`,
				});
		}

		await interaction.editReply({ embeds: [embed] });
	} catch (error) {
		logger.error({ error }, '[Prompt] Command failed');
		embed
			.setTitle('Prompt')
			.setColor('Red')
			.setDescription(
				'Something went wrong while processing your request. Please try again.',
			);
		await interaction.editReply({ embeds: [embed] });
	}
}
