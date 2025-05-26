import { availableParallelism } from 'node:os';
import { type QueueFilters, useMainPlayer } from 'discord-player';
import type { EmbedBuilder, VoiceBasedChannel } from 'discord.js';
import Queue from 'p-queue';
import type { ProcessingInteraction } from '../types/ProcessingInteraction';
import determineSearchEngine from './determineSearchEngine';
import logger from './logger';

type ProcessTrackOptions = {
	items: string[];
	voiceChannel: VoiceBasedChannel;
	interaction: ProcessingInteraction;
	embed: EmbedBuilder;
	pluralizeFunction: (count: number, total: number) => string;
	nodeMetadata?: Record<string, unknown>;
	onError?: (error: unknown, context: string) => void;
};

export default async function processTracksWithQueue({
	items,
	voiceChannel,
	interaction,
	embed,
	pluralizeFunction,
	nodeMetadata = {},
	onError = (error, context) => logger.error(error, context),
}: ProcessTrackOptions) {
	const player = useMainPlayer();
	let enqueued = 0;

	const tracksQueue = new Queue({ concurrency: availableParallelism() });

	tracksQueue.on('completed', async () => {
		const progress = items.length - tracksQueue.pending;
		await interaction.editReply({
			content: null,
			components: [],
			embeds: [embed.setDescription(pluralizeFunction(progress, items.length))],
		});
	});

	await tracksQueue.addAll(
		items.map((item) => async () => {
			try {
				const result = await player.play(voiceChannel, item, {
					searchEngine: determineSearchEngine(item),
					nodeOptions: {
						metadata: { interaction, ...nodeMetadata },
						defaultFFmpegFilters: ['_normalizer' as keyof QueueFilters],
					},
					requestedBy: interaction.user,
				});
				enqueued++;
				return result;
			} catch (error) {
				onError(error, 'Queue processing error');
				return null; // Return null to indicate failure without throwing
			}
		}),
	);

	await tracksQueue.onIdle();

	return { enqueued };
}
