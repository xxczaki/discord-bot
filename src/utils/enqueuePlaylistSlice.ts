import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	type ChatInputCommandInteraction,
	EmbedBuilder,
	type VoiceBasedChannel,
} from 'discord.js';
import { useQueue } from 'discord-player';
import { DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS } from '../constants/miscellaneous';
import cleanUpPlaylistContent from './cleanUpPlaylistContent';
import getEnvironmentVariable from './getEnvironmentVariable';
import pluralize from './pluralize';
import processTracksWithQueue from './processTracksWithQueue';

const pluralizeEntries = pluralize('entry', 'entries');
const pluralizeSongs = pluralize('song', 'songs');

export default async function enqueuePlaylistSlice(
	interaction: ChatInputCommandInteraction,
	voiceChannel: VoiceBasedChannel,
	playlistId: string,
	sliceType: 'head' | 'tail',
	count: number,
): Promise<void> {
	const playlistQuery = `id="${playlistId}"`;

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
		.setDescription(
			pluralizeSongs`Fetching ${sliceType === 'head' ? 'first' : 'last'} ${count} ${null}…`,
		);

	await interaction.reply({
		components: [],
		embeds: [embed],
	});

	const messages = await playlistsChannel.messages.fetch({
		limit: 100,
		cache: false,
	});

	const playlistMessage = messages.find((message) =>
		message.content.includes(playlistQuery),
	);

	if (!playlistMessage) {
		await interaction.editReply({
			content: `Playlist "${playlistId}" not found!`,
			embeds: [],
			components: [],
		});
		return;
	}

	const songs = cleanUpPlaylistContent(playlistMessage.content);

	const allSongs = songs
		.trim()
		.split('\n')
		.filter((song) => song.trim() !== '');

	if (allSongs.length === 0) {
		await interaction.editReply({
			content: `Playlist "${playlistId}" is empty!`,
			embeds: [],
			components: [],
		});
		return;
	}

	// Apply head or tail slicing
	const slicedSongs =
		sliceType === 'head' ? allSongs.slice(0, count) : allSongs.slice(-count);

	const queries = Object.fromEntries(
		slicedSongs.map((song, index) => [index.toString(), song]),
	);

	const { enqueued } = await processTracksWithQueue({
		items: slicedSongs,
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

	const sliceDescription = sliceType === 'head' ? 'first' : 'last';
	const actualCount = slicedSongs.length;
	const totalCount = allSongs.length;

	let fromDescription: string;

	if (actualCount === totalCount) {
		fromDescription = pluralizeSongs`${actualCount} ${null}`;
	} else {
		fromDescription = `the ${sliceDescription} ${actualCount} of ${pluralizeSongs`${totalCount} ${null}`}`;
	}

	const response = await interaction.editReply({
		content: null,
		embeds: [
			embed
				.setTitle('✅ Done')
				.setDescription(
					pluralizeEntries`${enqueued} ${null} from ${fromDescription} had been processed and added to the queue.\n${
						slicedSongs.length - enqueued
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
