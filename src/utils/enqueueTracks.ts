import { availableParallelism } from 'node:os';
import {
	type QueueFilters,
	type Track,
	useMainPlayer,
	useQueue,
} from 'discord-player';
import {
	type ButtonInteraction,
	type CacheType,
	EmbedBuilder,
	type VoiceBasedChannel,
} from 'discord.js';
import Queue from 'p-queue';
import determineSearchEngine from './determineSearchEngine';
import logger from './logger';
import pluralize from './pluralize';

type Props = {
	tracks: Track[];
	progress: number;
	voiceChannel: VoiceBasedChannel;
};

const pluralizeTracks = pluralize('track', 'tracks');

export default async function enqueueTracks(
	interaction: ButtonInteraction<CacheType>,
	{ tracks, progress, voiceChannel }: Props,
) {
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
				metadata: interaction,
				defaultFFmpegFilters: ['_normalizer' as keyof QueueFilters],
				enableStreamInterceptor: true,
			},
			audioPlayerOptions: {
				seek: progress,
			},
			requestedBy: interaction.user.id,
		});

		await interaction.editReply({
			components: [],
			embeds: [
				embed.setDescription('Starting to process the rest of the tracks…'),
			],
		});
	} catch (error) {
		logger.error(error, 'Queue recovery error (first track)');
	}

	let enqueued = 0;

	const tracksQueue = new Queue({ concurrency: availableParallelism() });

	tracksQueue.on('next', async () => {
		await interaction.editReply({
			content: null,
			components: [],
			embeds: [
				embed.setDescription(
					pluralizeTracks`${tracks.length - tracksQueue.pending}/${tracks.length} ${null} processed and added to the queue so far.`,
				),
			],
		});
	});

	await tracksQueue.addAll(
		toQueue.map(({ url }) => async () => {
			const promise = player.play(voiceChannel, url, {
				searchEngine: determineSearchEngine(url),
				nodeOptions: {
					metadata: interaction,
					defaultFFmpegFilters: ['_normalizer' as keyof QueueFilters],
					enableStreamInterceptor: true,
				},
				requestedBy: interaction.user.id,
			});

			try {
				enqueued++;

				return await promise;
			} catch (error) {
				enqueued--;
				logger.error(error, 'Queue recovery error (subsequent tracks)');
			}
		}),
	);

	await tracksQueue.onIdle();

	const queue = useQueue();

	if (!queue) {
		return interaction.editReply({
			content: 'The queue is empty.',
			embeds: [],
		});
	}

	queue.tracks.store = queue?.tracks.data.sort((a, b) => {
		const correspondingAId = tracks.find(({ url }) => url === a.url) ?? a.id;
		const correspondingBId = tracks.find(({ url }) => url === b.url) ?? b.id;

		if (correspondingAId < correspondingBId) {
			return -1;
		}

		if (correspondingAId > correspondingBId) {
			return 1;
		}

		return 0;
	});

	await interaction.editReply({
		content: null,
		embeds: [
			embed.setTitle('✅ Done').setDescription(
				pluralizeTracks`${enqueued} ${null} had been processed and added to the queue.\n${
					tracks.length - enqueued - 1 // excludes `queue.currentTrack`
				} skipped.`,
			),
		],
	});
}
