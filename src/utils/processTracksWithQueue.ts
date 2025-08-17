import { availableParallelism } from 'node:os';
import type { EmbedBuilder, VoiceBasedChannel } from 'discord.js';
import { type QueueFilters, useMainPlayer } from 'discord-player';
import Queue from 'p-queue';
import type { ProcessingInteraction } from '../types/ProcessingInteraction';
import determineSearchEngine from './determineSearchEngine';
import isObject from './isObject';
import logger from './logger';
import pluralize from './pluralize';

const MAX_CONCURRENCY = 3;
const PROGRESS_UPDATE_INTERVAL_MS = 2000;
const BATCH_SIZE = 10;

type ProcessTrackOptions = {
	items: string[];
	voiceChannel: VoiceBasedChannel;
	interaction: ProcessingInteraction;
	embed: EmbedBuilder;
	nodeMetadata?: Record<string, unknown>;
	onError?: (error: unknown, context: string) => void;
};

export default async function processTracksWithQueue({
	items,
	voiceChannel,
	interaction,
	embed,
	nodeMetadata = {},
	onError = (error, context) => logger.error(error, context),
}: ProcessTrackOptions) {
	const player = useMainPlayer();

	let enqueued = 0;
	let processed = 0;
	let lastUpdateTime = 0;

	const pluralizeItems = pluralize('item', 'items');

	const concurrency = Math.min(
		MAX_CONCURRENCY,
		Math.ceil(availableParallelism() / 4),
	);
	const tracksQueue = new Queue({ concurrency });

	const updateProgress = async (force = false) => {
		const now = Date.now();

		if (!force && now - lastUpdateTime < PROGRESS_UPDATE_INTERVAL_MS) {
			return;
		}

		lastUpdateTime = now;
		const currentProgress = processed;

		try {
			await interaction.editReply({
				content: null,
				components: [],
				embeds: [
					embed.setDescription(
						pluralizeItems`${currentProgress}/${items.length} ${null} processed and added to the queue so far.`,
					),
				],
			});
		} catch {}
	};

	if (items.length <= 10) {
		tracksQueue.on('completed', () => updateProgress());

		await tracksQueue.addAll(
			items.map((item, index) => async () => {
				try {
					const result = await player.play(voiceChannel, item, {
						searchEngine: determineSearchEngine(item),
						fallbackSearchEngine: 'youtubeSearch',
						nodeOptions: {
							metadata: { interaction, ...nodeMetadata },
							defaultFFmpegFilters: ['_normalizer' as keyof QueueFilters],
						},
						requestedBy: interaction.user,
					});

					if (result.track && nodeMetadata.queries) {
						const queries = nodeMetadata.queries as Record<string, string>;
						const queryForTrack = queries[index.toString()];

						if (queryForTrack) {
							result.track.setMetadata({
								...(isObject(result.track.metadata)
									? result.track.metadata
									: {}),
								originalQuery: queryForTrack,
							});
						}
					}

					enqueued++;
					processed++;

					return result;
				} catch (error) {
					processed++;
					onError(error, 'Queue processing error');

					return null;
				}
			}),
		);
	} else {
		const searchAndAddBatch = async (
			batch: string[],
			batchStartIndex: number,
		) => {
			const results = await Promise.allSettled(
				batch.map(async (item, batchIndex) => {
					try {
						const result = await player.play(voiceChannel, item, {
							searchEngine: determineSearchEngine(item),
							fallbackSearchEngine: 'youtubeSearch',
							nodeOptions: {
								metadata: { interaction, ...nodeMetadata },
								defaultFFmpegFilters: ['_normalizer' as keyof QueueFilters],
							},
							requestedBy: interaction.user,
						});

						if (result.track && nodeMetadata.queries) {
							const queries = nodeMetadata.queries as Record<string, string>;
							const itemIndex = batchStartIndex + batchIndex;
							const queryForTrack = queries[itemIndex.toString()];

							if (queryForTrack) {
								result.track.setMetadata({
									...(isObject(result.track.metadata)
										? result.track.metadata
										: {}),
									originalQuery: queryForTrack,
								});
							}
						}

						processed++;
						return result;
					} catch (error) {
						processed++;
						onError(error, `Batch processing error for item: ${item}`);
						return null;
					}
				}),
			);

			const batchEnqueued = results.filter(
				(result) => result.status === 'fulfilled' && result.value,
			).length;
			enqueued += batchEnqueued;

			await updateProgress();

			return batchEnqueued;
		};

		const batches: string[][] = [];
		const batchIndices: number[] = [];

		for (let i = 0; i < items.length; i += BATCH_SIZE) {
			batches.push(items.slice(i, i + BATCH_SIZE));
			batchIndices.push(i);
		}

		await tracksQueue.addAll(
			batches.map(
				(batch, index) => () => searchAndAddBatch(batch, batchIndices[index]),
			),
		);
	}

	await tracksQueue.onIdle();

	await updateProgress(true);

	return { enqueued };
}
