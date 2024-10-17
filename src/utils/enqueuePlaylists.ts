import type { QueueFilters } from 'discord-player';
import type {
	CacheType,
	GuildMember,
	StringSelectMenuInteraction,
} from 'discord.js';
import { PLAYLISTS_CHANNEL_ID } from '../constants/channelIds';

export default async function enqueuePlaylists(
	interaction: StringSelectMenuInteraction<CacheType>,
) {
	const playlistIds = interaction.values.map((value) => `id="${value}"`);
	const playlistsChannel =
		interaction.client.channels.cache.get(PLAYLISTS_CHANNEL_ID);

	if (!playlistsChannel?.isTextBased()) {
		return interaction.editReply({
			content: 'Invalid playlists channel type!',
			components: [],
		});
	}

	const messages = await playlistsChannel.messages.fetch({
		limit: 30,
		cache: true,
	});

	const { default: cleanUpPlaylistContent } = await import(
		'../utils/cleanUpPlaylistContent'
	);

	const songs = messages
		.filter((message) => playlistIds.some((id) => message.content.includes(id)))
		.map((message) => cleanUpPlaylistContent(message.content))
		.join('\n');

	const voiceChannel = (interaction.member as GuildMember).voice.channel;

	if (!voiceChannel) {
		return interaction.editReply({
			content: 'You are not connected to a voice channel!',
			components: [],
		});
	}

	const [
		{ default: Queue },
		{ useMainPlayer },
		{ default: isYouTubeLink },
		{ EmbedBuilder },
	] = await Promise.all([
		import('p-queue'),
		import('discord-player'),
		import('../utils/isYouTubeLink'),
		import('discord.js'),
	]);

	const playlistQueue = new Queue();
	const songsArray = songs.trim().split('\n');
	const player = useMainPlayer();

	let enqueued = 0;

	const embed = new EmbedBuilder().setTitle('⏳ Processing playlist(s)…');

	playlistQueue.on('next', async () => {
		await interaction.editReply({
			content: null,
			components: [],
			embeds: [
				embed.setDescription(
					`${songsArray.length - playlistQueue.pending}/${songsArray.length} song(s) processed and added to the queue so far.`,
				),
			],
		});
	});

	playlistQueue.on('idle', async () => {
		const { useQueue } = await import('discord-player');
		const queue = useQueue(interaction.guild?.id ?? '');

		queue?.tracks.shuffle();

		await interaction.editReply({
			content: null,
			embeds: [
				embed
					.setTitle('✅ Playlist(s) loaded')
					.setDescription(
						`${enqueued} song(s) had been processed and added to the queue.\n${
							songsArray.length - enqueued
						} skipped.`,
					)
					.setFooter({
						text: 'ℹ️ The queue was automatically shuffled for you.',
					}),
			],
		});
	});

	await playlistQueue.addAll(
		songsArray.map((song) => async () => {
			const promise = player.play(voiceChannel, song, {
				searchEngine: isYouTubeLink(song) ? 'youtubeVideo' : 'spotifySearch',
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
