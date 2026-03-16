import {
	type OpenAILanguageModelResponsesOptions,
	openai,
} from '@ai-sdk/openai';
import { stepCountIs, streamText } from 'ai';
import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder, type GuildMember } from 'discord.js';
import { useQueue } from 'discord-player';
import logger from '../utils/logger';
import {
	formatToolArgs,
	generateSuccessMessage,
	generateSystemPrompt,
	getAvailableTools,
	isReadOnlyTool,
	OPENAI_PROVIDER_OPTIONS,
	PROMPT_MODEL_ID,
	type ToolContext,
	type ToolResult,
} from '../utils/promptTools';
import { RateLimiter } from '../utils/RateLimiter';

const rateLimiter = RateLimiter.getInstance('prompt-command', 100, 24);

export default async function promptCommandHandler(
	interaction: ChatInputCommandInteraction,
) {
	const apiKey = process.env.OPENAI_API_KEY;

	if (!apiKey) {
		return interaction.editReply('The `/prompt` command is not available.');
	}

	const voiceChannel = (interaction.member as GuildMember).voice.channel;

	if (!voiceChannel) {
		return interaction.editReply('You are not connected to a voice channel!');
	}

	if (!rateLimiter.canMakeCall()) {
		return interaction.editReply(
			'Daily rate limit reached (100 calls per day). Try again tomorrow.',
		);
	}

	const prompt = interaction.options.getString('prompt', true);

	const embed = new EmbedBuilder()
		.setTitle('Prompt')
		.setColor('Blue')
		.setDescription('Processing…');
	await interaction.editReply({ embeds: [embed] });

	try {
		const queue = useQueue();
		const currentTrack = queue?.currentTrack ?? null;

		const toolContext: ToolContext = {
			queue,
			currentTrackTitle: currentTrack?.title ?? 'None',
			currentTrackAuthor: currentTrack?.author ?? 'N/A',
			trackCount: queue?.tracks.size ?? 0,
			interaction,
			voiceChannel,
		};

		const result = streamText({
			model: openai(PROMPT_MODEL_ID),
			system: generateSystemPrompt(toolContext),
			prompt: `User request: "${prompt}"`,
			tools: getAvailableTools(toolContext),
			stopWhen: stepCountIs(5),
			maxRetries: 2,
			temperature: 0.1,
			providerOptions: {
				openai:
					OPENAI_PROVIDER_OPTIONS satisfies OpenAILanguageModelResponsesOptions,
			},
		});

		rateLimiter.incrementCall();

		const completedActions: string[] = [];

		const pendingTools = new Map<string, string>();

		for await (const part of result.fullStream) {
			if (part.type === 'tool-call') {
				pendingTools.set(part.toolCallId, part.toolName);
			} else if (part.type === 'tool-result') {
				const toolName = pendingTools.get(part.toolCallId);
				if (!toolName) continue;
				pendingTools.delete(part.toolCallId);

				if (isReadOnlyTool(toolName)) continue;

				const output = 'output' in part ? part.output : undefined;
				const toolResult = output as ToolResult | undefined;
				const input = ('input' in part ? part.input : undefined) as
					| Record<string, unknown>
					| undefined;

				const successMsg = generateSuccessMessage(toolName, toolResult ?? {});
				const formattedArgs = input ? formatToolArgs(input) : undefined;
				const line = formattedArgs
					? `✅ ${successMsg} (${formattedArgs})`
					: `✅ ${successMsg}`;
				completedActions.push(line);

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
