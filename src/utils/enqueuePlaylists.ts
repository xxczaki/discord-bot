import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	type ChatInputCommandInteraction,
	EmbedBuilder,
	type StringSelectMenuInteraction,
	type VoiceBasedChannel,
} from 'discord.js';
import { useQueue } from 'discord-player';
import { DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS } from '../constants/miscellaneous';
import cleanUpPlaylistContent from './cleanUpPlaylistContent';
import getEnvironmentVariable from './getEnvironmentVariable';
import pluralize from './pluralize';
import processTracksWithQueue from './processTracksWithQueue';

const pluralizeEntries = pluralize('entry', 'entries');

export default async function enqueuePlaylists(
	interaction: StringSelectMenuInteraction,
	voiceChannel: VoiceBasedChannel,
): Promise<void>;
export default async function enqueuePlaylists(
	interaction: ChatInputCommandInteraction,
	voiceChannel: VoiceBasedChannel,
	playlistIds: string[],
): Promise<void>;
export default async function enqueuePlaylists(
	interaction: StringSelectMenuInteraction | ChatInputCommandInteraction,
	voiceChannel: VoiceBasedChannel,
	playlistIdsParam?: string[],
): Promise<void> {
	const playlistIds = playlistIdsParam
		? playlistIdsParam.map((value) => `id="${value}"`)
		: (interaction as StringSelectMenuInteraction).values.map(
				(value) => `id="${value}"`,
			);

	const playlistsChannel = interaction.client.channels.cache.get(
		getEnvironmentVariable('PLAYLISTS_CHANNEL_ID'),
	);

	if (!playlistsChannel?.isTextBased()) {
		await interaction.reply({
			content: 'Invalid playlists channel type!',
			components: [],
		});
		return;
	}

	const embed = new EmbedBuilder()
		.setTitle('⏳ Processing')
		.setDescription('Fetching all the songs…');

	await interaction.reply({
		components: [],
		embeds: [embed],
	});

	const messages = await playlistsChannel.messages.fetch({
		limit: 100,
		cache: false,
	});

	const songs = messages
		.filter((message) => playlistIds.some((id) => message.content.includes(id)))
		.map((message) => cleanUpPlaylistContent(message.content))
		.join('\n');

	const songsArray = songs
		.trim()
		.split('\n')
		.filter((song) => song.trim() !== '');

	const queries = Object.fromEntries(
		songsArray.map((song, index) => [index.toString(), song]),
	);

	const { enqueued } = await processTracksWithQueue({
		items: songsArray,
		voiceChannel,
		interaction,
		embed,
		nodeMetadata: { queries },
	});

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
			time: DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS,
		});

		if (answer.customId === 'shuffle') {
			queue?.tracks.shuffle();
		}

		await response.edit({ components: [] });
	} catch {
		await response.delete();
	}
}
