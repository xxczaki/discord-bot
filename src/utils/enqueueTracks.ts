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
import logger from './logger';

type Props = {
	tracks: Track[];
	progress: number;
	voiceChannel: VoiceBasedChannel;
};

export default async function enqueueTracks(
	interaction: ButtonInteraction<CacheType>,
	{ tracks, progress, voiceChannel }: Props,
) {
	const player = useMainPlayer();
	const [firstTrack, ...toQueue] = tracks;

	const embed = new EmbedBuilder()
		.setTitle('⏳ Processing track(s)')
		.setDescription('Loading the initial track…');

	await interaction.reply({
		components: [],
		embeds: [embed],
	});

	try {
		await player.play(voiceChannel, firstTrack.url, {
			nodeOptions: {
				metadata: interaction,
				defaultFFmpegFilters: ['_normalizer' as keyof QueueFilters],
			},
			audioPlayerOptions: {
				seek: progress,
			},
			requestedBy: interaction.user.id,
		});
	} catch (error) {
		logger.error(error, 'Queue recovery error (first track)');
	}

	let enqueued = 0;

	const tracksQueue = new Queue();

	tracksQueue.on('next', async () => {
		await interaction.editReply({
			content: null,
			components: [],
			embeds: [
				embed.setDescription(
					`${tracks.length - tracksQueue.pending}/${tracks.length} track(s) processed and added to the queue so far.`,
				),
			],
		});
	});

	await tracksQueue.addAll(
		toQueue.map(({ url }) => async () => {
			const promise = player.play(voiceChannel, url, {
				nodeOptions: {
					metadata: interaction,
					defaultFFmpegFilters: ['_normalizer' as keyof QueueFilters],
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
			embed.setTitle('✅ Track(s) loaded').setDescription(
				`${enqueued} track(s) had been processed and added to the queue.\n${
					tracks.length - enqueued - 1 // excludes `queue.currentTrack`
				} skipped.`,
			),
		],
	});
}
