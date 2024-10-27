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
	const player = useMainPlayer();

	let enqueued = 0;

	const embed = new EmbedBuilder().setTitle('⏳ Processing track(s)…');

	playlistQueue.on('next', async () => {
		await interaction.editReply({
			content: null,
			components: [],
			embeds: [
				embed.setDescription(
					`${tracks.length - playlistQueue.pending}/${tracks.length} track(s) processed and added to the queue so far.`,
				),
			],
		});
	});

	playlistQueue.on('idle', async () => {
		const queue = useQueue(interaction.guild?.id ?? '');

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
				embed
					.setTitle('✅ Track(s) loaded')
					.setDescription(
						`${enqueued} track(s) had been processed and added to the queue.\n${
							tracks.length - enqueued
						} skipped.`,
					),
			],
		});
	});

	await playlistQueue.addAll(
		tracks.map(({ url, ...rest }) => async () => {
			const promise = player.play(voiceChannel, url, {
				searchEngine: isYouTubeLink(url) ? 'youtubeVideo' : 'spotifySong',
				nodeOptions: {
					metadata: interaction,
					defaultFFmpegFilters: ['normalize' as keyof QueueFilters],
				},
				requestedBy: interaction.user.id,
			});

			try {
				enqueued++;

				const result = await promise;

				if ('progress' in rest) {
					await result.queue.node.seek(rest.progress as number);
				}

				return result;
			} catch {
				enqueued--;
			}
		}),
	);
}
