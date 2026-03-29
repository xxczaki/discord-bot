import { availableParallelism } from 'node:os';
import type { EmbedBuilder, VoiceBasedChannel } from 'discord.js';
import { type QueueFilters, useMainPlayer } from 'discord-player';
import Queue from 'p-queue';
import { FALLBACK_SEARCH_ENGINE } from '../constants/sourceConfig';
import type { ProcessingInteraction } from '../types/ProcessingInteraction';
import type { QueueMetadata } from '../types/QueueMetadata';
import determineSearchEngine from './determineSearchEngine';
import isObject from './isObject';
import logger from './logger';
import pluralize from './pluralize';

const MAX_CONCURRENCY = 3;
const PROGRESS_UPDATE_INTERVAL_MS = 2000;

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

	const playOptions = {
		fallbackSearchEngine: FALLBACK_SEARCH_ENGINE,
		nodeOptions: {
			metadata: {
				interaction,
				...nodeMetadata,
			} satisfies QueueMetadata,
			defaultFFmpegFilters: ['_normalizer' as keyof QueueFilters],
		},
		requestedBy: interaction.user,
	};

	const applyQueryMetadata = (
		track: { metadata: unknown; setMetadata: (metadata: unknown) => void },
		itemIndex: number,
	) => {
		/* v8 ignore start */
		if (nodeMetadata.queries) {
			const queries = nodeMetadata.queries as Record<string, string>;
			const queryForTrack = queries[itemIndex.toString()];

			if (queryForTrack) {
				track.setMetadata({
					...(isObject(track.metadata) ? track.metadata : {}),
					originalQuery: queryForTrack,
				});
			}
		}
		/* v8 ignore stop */
	};

	const [firstItem, ...remainingItems] = items;

	if (interaction.channel?.isSendable()) {
		try {
			await interaction.channel.sendTyping();
		} catch {}
	}

	try {
		const result = await player.play(voiceChannel, firstItem, {
			searchEngine: determineSearchEngine(firstItem),
			...playOptions,
		});

		if (result.track) {
			applyQueryMetadata(result.track, 0);
		}

		enqueued++;
		processed++;
	} catch (error) {
		processed++;
		onError(error, 'Queue processing error');
	}

	if (remainingItems.length > 0) {
		tracksQueue.on('completed', () => updateProgress());

		await tracksQueue.addAll(
			remainingItems.map((item, index) => async () => {
				const itemIndex = index + 1;

				try {
					const result = await player.play(voiceChannel, item, {
						searchEngine: determineSearchEngine(item),
						...playOptions,
					});

					if (result.track) {
						applyQueryMetadata(result.track, itemIndex);
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
	}

	await tracksQueue.onIdle();

	await updateProgress(true);

	return { enqueued };
}
