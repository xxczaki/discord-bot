import { EmbedBuilder, type VoiceBasedChannel } from 'discord.js';
import {
	type QueueFilters,
	type Track,
	useMainPlayer,
	useQueue,
} from 'discord-player';
import type { ProcessingInteraction } from '../types/ProcessingInteraction';
import determineSearchEngine from './determineSearchEngine';
import pluralize from './pluralize';
import processTracksWithQueue from './processTracksWithQueue';
import reportError from './reportError';

type Props = {
	tracks: Track[];
	progress: number;
	voiceChannel: VoiceBasedChannel;
	interaction: ProcessingInteraction;
};

const pluralizeTracks = pluralize('track', 'tracks');

export default async function enqueueTracks({
	tracks,
	progress,
	voiceChannel,
	interaction,
}: Props) {
	const player = useMainPlayer();
	const [{ url: firstTrackUrl }, ...toQueue] = tracks;

	const embed = new EmbedBuilder()
		.setTitle('⏳ Processing')
		.setDescription('Loading the initial track…');

	await interaction.reply({
		components: [],
		embeds: [embed],
	});

	let firstTrackFailed = false;

	try {
		await player.play(voiceChannel, firstTrackUrl, {
			searchEngine: determineSearchEngine(firstTrackUrl),
			nodeOptions: {
				metadata: { interaction },
				defaultFFmpegFilters: ['_normalizer' as keyof QueueFilters],
			},
			audioPlayerOptions: {
				seek: progress,
			},
			requestedBy: interaction.user,
		});

		await interaction.editReply({
			components: [],
			embeds: [
				embed.setDescription('Starting to process the rest of the tracks…'),
			],
		});
	} catch (error) {
		firstTrackFailed = true;
		reportError(error, 'Queue recovery error (first track)');

		embed
			.setTitle('⚠️ Partial Recovery')
			.setDescription(
				'The first track failed to load. Attempting to load remaining tracks…',
			)
			.setColor('Orange');

		await interaction.editReply({
			components: [],
			embeds: [embed],
		});
	}

	if (toQueue.length === 0) {
		const queue = useQueue();

		if (!queue) {
			if (firstTrackFailed) {
				return interaction.editReply({
					content: null,
					embeds: [
						embed
							.setTitle('❌ Recovery Failed')
							.setDescription(
								'The only track in the queue failed to load. Recovery could not be completed.',
							)
							.setColor('Red'),
					],
				});
			}

			return interaction.editReply({
				content: 'The queue is empty.',
				embeds: [],
			});
		}

		return interaction.editReply({
			content: null,
			embeds: [
				embed
					.setTitle(firstTrackFailed ? '⚠️ Partial Recovery' : '✅ Complete')
					.setDescription(
						firstTrackFailed
							? 'The first track failed to load, but the queue is ready.'
							: pluralizeTracks`Successfully recovered ${1} ${null}.`,
					)
					.setColor(firstTrackFailed ? 'Orange' : 'Green'),
			],
		});
	}

	const { enqueued } = await processTracksWithQueue({
		items: toQueue.map(({ url }) => url),
		voiceChannel,
		interaction,
		embed,
		onError: (error, _context) => {
			reportError(error, 'Queue recovery error (subsequent tracks)');
		},
	});

	const queue = useQueue();

	if (!queue) {
		return interaction.editReply({
			content: 'The queue is empty.',
			embeds: [],
		});
	}

	if (queue?.tracks) {
		queue.tracks.store =
			queue?.tracks?.data?.sort((a, b) => {
				const indexA = tracks.findIndex(({ url }) => url === a.url);
				const indexB = tracks.findIndex(({ url }) => url === b.url);

				// If track not found in original array, put it at the end
				if (indexA === -1 && indexB === -1) return 0;
				if (indexA === -1) return 1;
				if (indexB === -1) return -1;

				return indexA - indexB;
			}) || [];
	}

	const successfullyEnqueued = firstTrackFailed ? enqueued : enqueued + 1;
	const skipped = tracks.length - successfullyEnqueued;
	const wasPartial = firstTrackFailed || skipped > 0;

	await interaction.editReply({
		content: null,
		embeds: [
			embed
				.setTitle(wasPartial ? '⚠️ Partial Recovery' : '✅ Complete')
				.setDescription(
					skipped > 0
						? pluralizeTracks`Successfully recovered ${successfullyEnqueued} ${null}.\n\n${skipped} ${null} could not be loaded (may be unavailable, region-locked, or removed).`
						: pluralizeTracks`Successfully recovered all ${successfullyEnqueued} ${null}.`,
				)
				.setColor(wasPartial ? 'Orange' : 'Green'),
		],
	});
}
