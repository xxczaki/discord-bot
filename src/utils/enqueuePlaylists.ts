import type { QueueFilters } from 'discord-player';
import type {
	ButtonBuilder,
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
		return interaction.update({
			content: 'Invalid playlists channel type!',
			components: [],
		});
	}

	const messages = await playlistsChannel.messages.fetch({
		limit: 25,
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
		return interaction.update({
			content: 'You are not connected to a voice channel!',
			components: [],
		});
	}

	const [
		{ default: Queue },
		{ useMainPlayer },
		{ default: isYouTubeLink },
		{ EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle },
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

	const embed = new EmbedBuilder()
		.setTitle('✅ Playlists loaded')
		.setDescription(
			`${enqueued} song(s) processed and added to queue.\n${
				songsArray.length - enqueued
			} skipped.`,
		);

	const shuffle = new ButtonBuilder()
		.setCustomId('shuffle')
		.setLabel('Shuffle')
		.setStyle(ButtonStyle.Secondary);

	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(shuffle);

	const response = await interaction.update({
		embeds: [embed],
		components: [row],
	});

	try {
		const answer = await response.awaitMessageComponent({
			time: 60_000, // 1 minute
		});

		if (answer.customId === 'shuffle') {
			const { useQueue } = await import('discord-player');
			const queue = useQueue(interaction.guild?.id ?? '');

			queue?.tracks.shuffle();

			return answer.update({
				content: 'Queue shuffled.',
				embeds: [],
				components: [],
			});
		}

		await response.edit({
			components: [],
		});
	} catch {
		await response.edit({
			components: [],
		});
	}
}
