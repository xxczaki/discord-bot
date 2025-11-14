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
import { StatsHandler } from './StatsHandler';

const pluralizeSongs = pluralize('song', 'songs');
const statsHandler = StatsHandler.getInstance();

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

	const queries = Object.fromEntries(
		allSongs.map((song, index) => [index.toString(), song]),
	);

	const queue = useQueue();
	const initialQueueSize = queue?.tracks.size ?? 0;

	const { enqueued } = await processTracksWithQueue({
		items: allSongs,
		voiceChannel,
		interaction,
		embed,
		nodeMetadata: { queries },
	});

	if (enqueued === 0) {
		await interaction.editReply({
			content: 'No tracks were added to the queue.',
			embeds: [],
			components: [],
		});
		return;
	}

	const updatedQueue = useQueue();

	if (!updatedQueue) {
		await interaction.editReply({
			content: 'Queue not found after processing.',
			embeds: [],
			components: [],
		});
		return;
	}

	const finalQueueSize = updatedQueue.tracks.size;
	const isCurrentTrackNew = initialQueueSize === 0 && updatedQueue.currentTrack;
	const addedTracksCount =
		finalQueueSize - initialQueueSize + (isCurrentTrackNew ? 1 : 0);

	if (addedTracksCount > count) {
		const allTracks = updatedQueue.tracks.toArray();
		const newlyAddedTracks = allTracks.slice(
			initialQueueSize,
			initialQueueSize + addedTracksCount - (isCurrentTrackNew ? 1 : 0),
		);

		const allNewTracks = isCurrentTrackNew
			? [updatedQueue.currentTrack, ...newlyAddedTracks]
			: newlyAddedTracks;

		const tracksToKeep =
			sliceType === 'head'
				? allNewTracks.slice(0, count)
				: allNewTracks.slice(-count);

		if (
			isCurrentTrackNew &&
			!tracksToKeep.includes(updatedQueue.currentTrack)
		) {
			updatedQueue.node.skip();
		}

		const remainingTracksToQueue = tracksToKeep.filter(
			(track) => track !== updatedQueue.currentTrack,
		);

		updatedQueue.tracks.store = [
			...allTracks.slice(0, initialQueueSize),
			...remainingTracksToQueue,
		];
	}

	const shuffle = new ButtonBuilder()
		.setCustomId('shuffle')
		.setLabel('Shuffle')
		.setStyle(ButtonStyle.Secondary);

	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(shuffle);

	const sliceDescription = sliceType === 'head' ? 'first' : 'last';
	const keptTracksCount = Math.min(addedTracksCount, count);
	const removedTracksCount = addedTracksCount - keptTracksCount;

	const description =
		removedTracksCount > 0
			? pluralizeSongs`Added the ${sliceDescription} ${keptTracksCount} ${null} from the playlist to the queue`
			: pluralizeSongs`Added ${keptTracksCount} ${null} from the playlist to the queue`;

	const descriptionParts = [description];

	void statsHandler.saveStat('playlist', {
		playlistId,
		requestedById: interaction.user.id,
	});

	const response = await interaction.editReply({
		content: null,
		embeds: [
			embed
				.setTitle('✅ Processing Complete')
				.setDescription(descriptionParts.join('\n'))
				.setColor('Green'),
		],
		components: [row],
	});

	try {
		const answer = await response.awaitMessageComponent({
			time: DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS,
		});

		if (answer.customId === 'shuffle') {
			updatedQueue.tracks.shuffle();
		}

		await response.edit({ components: [] });
	} catch {
		await response.delete();
	}
}
