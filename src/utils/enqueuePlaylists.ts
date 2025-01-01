import { type QueueFilters, useMainPlayer, useQueue } from 'discord-player';
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	type CacheType,
	EmbedBuilder,
	type GuildMember,
	type StringSelectMenuInteraction,
} from 'discord.js';
import Queue from 'p-queue';
import { PLAYLISTS_CHANNEL_ID } from '../constants/channelIds';
import cleanUpPlaylistContent from './cleanUpPlaylistContent';
import determineSearchEngine from './determineSearchEngine';

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

	const playlistQueue = new Queue({ concurrency: 16 });
	const songsArray = songs.trim().split('\n');

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

	const player = useMainPlayer();

	await playlistQueue.addAll(
		songsArray.map((song) => async () => {
			const promise = player.play(voiceChannel, song.replace('!sc', ''), {
				searchEngine: determineSearchEngine(song),
				nodeOptions: {
					metadata: interaction,
					defaultFFmpegFilters: ['_normalizer' as keyof QueueFilters],
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

	await playlistQueue.onIdle();

	const shuffle = new ButtonBuilder()
		.setCustomId('shuffle')
		.setLabel('Shuffle')
		.setStyle(ButtonStyle.Secondary);

	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(shuffle);

	const response = await interaction.editReply({
		content: null,
		embeds: [
			embed
				.setTitle('✅ Playlist(s) loaded')
				.setDescription(
					`${enqueued} song(s) had been processed and added to the queue.\n${
						songsArray.length - enqueued
					} skipped.`,
				),
		],
		components: [row],
	});

	const queue = useQueue();

	try {
		const answer = await response.awaitMessageComponent({
			time: 60_000, // 1 minute
		});

		await answer.deferUpdate();

		if (answer.customId === 'shuffle') {
			queue?.tracks.shuffle();
		}

		await response.edit({ components: [] });
	} catch {
		await response.delete();
	}
}
