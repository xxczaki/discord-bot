import { captureException } from '@sentry/node';
import {
	type QueueFilters,
	type Track,
	useMainPlayer,
	useQueue,
} from 'discord-player';
import { EmbedBuilder, type VoiceBasedChannel } from 'discord.js';
import type { ProcessingInteraction } from '../types/ProcessingInteraction';
import determineSearchEngine from './determineSearchEngine';
import logger from './logger';
import pluralize from './pluralize';
import processTracksWithQueue from './processTracksWithQueue';

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
		logger.error(error, 'Queue recovery error (first track)');
		captureException(error);
	}

	if (toQueue.length === 0) {
		const queue = useQueue();
		
		if (!queue) {
			return interaction.editReply({
				content: 'The queue is empty.',
				embeds: [],
			});
		}

		return interaction.editReply({
			content: null,
			embeds: [
				embed
					.setTitle('✅ Done')
					.setDescription(
						pluralizeTracks`${1} ${null} had been processed and added to the queue.\n${0} skipped.`,
					),
			],
		});
	}

	const { enqueued } = await processTracksWithQueue({
		items: toQueue.map(({ url }) => url),
		voiceChannel,
		interaction,
		embed,
		onError: (error, _context) => {
			logger.error(error, 'Queue recovery error (subsequent tracks)');
			captureException(error);
		},
	});

	const queue = useQueue();

	if (!queue) {
		return interaction.editReply({
			content: 'The queue is empty.',
			embeds: [],
		});
	}

	queue.tracks.store = queue?.tracks.data.sort((a, b) => {
		const indexA = tracks.findIndex(({ url }) => url === a.url);
		const indexB = tracks.findIndex(({ url }) => url === b.url);

		// If track not found in original array, put it at the end
		if (indexA === -1 && indexB === -1) return 0;
		if (indexA === -1) return 1;
		if (indexB === -1) return -1;

		return indexA - indexB;
	});

	await interaction.editReply({
		content: null,
		embeds: [
			embed.setTitle('✅ Done').setDescription(
				pluralizeTracks`${enqueued + 1} ${null} had been processed and added to the queue.\n${
					tracks.length - enqueued - 1 // excludes `queue.currentTrack`
				} skipped.`,
			),
		],
	});
}
