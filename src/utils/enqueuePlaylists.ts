import { availableParallelism } from 'node:os';
import { type QueueFilters, useMainPlayer, useQueue } from 'discord-player';
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	type CacheType,
	EmbedBuilder,
	type StringSelectMenuInteraction,
	type VoiceBasedChannel,
} from 'discord.js';
import Queue from 'p-queue';
import cleanUpPlaylistContent from './cleanUpPlaylistContent';
import determineSearchEngine from './determineSearchEngine';
import getEnvironmentVariable from './getEnvironmentVariable';
import pluralize from './pluralize';

const pluralizeEntries = pluralize('entry', 'entries');

export default async function enqueuePlaylists(
	interaction: StringSelectMenuInteraction<CacheType>,
	voiceChannel: VoiceBasedChannel,
) {
	const playlistIds = interaction.values.map((value) => `id="${value}"`);
	const playlistsChannel = interaction.client.channels.cache.get(
		getEnvironmentVariable('PLAYLISTS_CHANNEL_ID'),
	);

	if (!playlistsChannel?.isTextBased()) {
		return interaction.reply({
			content: 'Invalid playlists channel type!',
			components: [],
		});
	}

	const embed = new EmbedBuilder()
		.setTitle('⏳ Processing')
		.setDescription('Fetching all the songs…');

	await interaction.reply({
		components: [],
		embeds: [embed],
	});

	const messages = await playlistsChannel.messages.fetch({
		limit: 30,
		cache: true,
	});

	const songs = messages
		.filter((message) => playlistIds.some((id) => message.content.includes(id)))
		.map((message) => cleanUpPlaylistContent(message.content))
		.join('\n');

	const playlistQueue = new Queue({ concurrency: availableParallelism() });
	const songsArray = songs.trim().split('\n');

	let enqueued = 0;

	playlistQueue.on('next', async () => {
		const progress = songsArray.length - playlistQueue.pending;

		await interaction.editReply({
			content: null,
			components: [],
			embeds: [
				embed.setDescription(
					pluralizeEntries`${progress}/${songsArray.length} ${null} processed and added to the queue so far.`,
				),
			],
		});
	});

	const player = useMainPlayer();

	await playlistQueue.addAll(
		songsArray.map((song) => async () => {
			const promise = player.play(voiceChannel, song, {
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
				.setTitle('✅ Done')
				.setDescription(
					pluralizeEntries`${enqueued} ${null} had been processed and added to the queue.\n${
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

		if (answer.customId === 'shuffle') {
			queue?.tracks.shuffle();
		}

		await response.edit({ components: [] });
	} catch {
		await response.delete();
	}
}
