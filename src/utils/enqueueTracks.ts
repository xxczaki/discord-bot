import { availableParallelism } from 'node:os';
import {
	type QueueFilters,
	type TrackJSON,
	useMainPlayer,
	useQueue,
} from 'discord-player';
import {
	type ButtonInteraction,
	type CacheType,
	EmbedBuilder,
	type GuildMember,
} from 'discord.js';
import Queue from 'p-queue';
import isYouTubeLink from './isYouTubeLink';

export default async function enqueueTracks(
	interaction: ButtonInteraction<CacheType>,
	tracks: TrackJSON[],
) {
	const voiceChannel = (interaction.member as GuildMember).voice.channel;

	if (!voiceChannel) {
		return interaction.editReply({
			content: 'You are not connected to a voice channel!',
			components: [],
		});
	}

	const playlistQueue = new Queue({ concurrency: availableParallelism() });
	const trackUrlsArray = tracks.map((track) => track.url);
	const player = useMainPlayer();

	let enqueued = 0;

	const embed = new EmbedBuilder().setTitle('⏳ Processing track(s)…');

	playlistQueue.on('next', async () => {
		await interaction.editReply({
			content: null,
			components: [],
			embeds: [
				embed.setDescription(
					`${trackUrlsArray.length - playlistQueue.pending}/${trackUrlsArray.length} track(s) processed and added to the queue so far.`,
				),
			],
		});
	});

	playlistQueue.on('idle', async () => {
		const queue = useQueue(interaction.guild?.id ?? '');

		queue?.tracks.shuffle();

		await interaction.editReply({
			content: null,
			embeds: [
				embed
					.setTitle('✅ Track(s) loaded')
					.setDescription(
						`${enqueued} track(s) had been processed and added to the queue.\n${
							trackUrlsArray.length - enqueued
						} skipped.`,
					),
			],
		});
	});

	await playlistQueue.addAll(
		trackUrlsArray.map((song) => async () => {
			const promise = player.play(voiceChannel, song, {
				searchEngine: isYouTubeLink(song) ? 'youtubeVideo' : 'spotifySong',
				nodeOptions: {
					metadata: interaction,
					defaultFFmpegFilters: ['normalize' as keyof QueueFilters],
				},
				requestedBy: interaction.user.id,
			});

			try {
				enqueued++;
				return await promise;
			} catch {
				enqueued--;
			}
		}),
	);
}
