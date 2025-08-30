import {
	StringSelectMenuOptionBuilder,
	type TextBasedChannel,
} from 'discord.js';
import cleanUpPlaylistContent from './cleanUpPlaylistContent';
import { ExternalPlaylistCache } from './ExternalPlaylistCache';
import isUrlSpotifyPlaylist from './isUrlSpotifyPlaylist';
import pluralize from './pluralize';
import redis from './redis';

const ITEMS_PER_PAGE = 25;

const pluralizeSongs = pluralize('song', 'songs');
const pluralizePlaylist = pluralize('playlist', 'playlists');
const externalPlaylistCache = new ExternalPlaylistCache(redis);

async function getPlaylists(channel: TextBasedChannel, page = 0) {
	const rawMessages = await channel.messages.fetch({
		limit: 100,
		cache: false,
	});
	const messages = rawMessages.map((message) => message.content);

	const allPlaylistsWithCache = await Promise.all(
		messages
			.flatMap((message) => {
				const match = /id="(?<id>.+)"/.exec(message);
				const id = match?.groups?.id;

				if (!id) {
					return [];
				}

				const cleanContent = cleanUpPlaylistContent(message);
				const songs = cleanContent ? cleanContent.split('\n') : [];

				return { id, songs };
			})
			.map(async ({ id, songs }) => ({
				id,
				description: await getPlaylistDescription(songs),
			})),
	);

	const sortedPlaylists = allPlaylistsWithCache.sort(({ id: a }, { id: b }) =>
		a.localeCompare(b, 'en', { sensitivity: 'base' }),
	);

	const startIndex = page * ITEMS_PER_PAGE;
	const endIndex = startIndex + ITEMS_PER_PAGE;
	const pageItems = sortedPlaylists.slice(startIndex, endIndex);

	const options = pageItems.map(({ id, description }) =>
		new StringSelectMenuOptionBuilder()
			.setLabel(id)
			.setDescription(description)
			.setValue(id),
	);

	const totalPages = Math.ceil(sortedPlaylists.length / ITEMS_PER_PAGE);
	const firstItemLabel = pageItems[0]?.id || '';
	const lastItemLabel = pageItems[pageItems.length - 1]?.id || '';

	const rangeIndicator =
		pageItems.length > 0
			? `${firstItemLabel.charAt(0).toUpperCase()}-${lastItemLabel.charAt(0).toUpperCase()}`
			: '';

	return {
		options,
		totalPages,
		currentPage: page,
		totalItems: sortedPlaylists.length,
		rangeIndicator,
		hasMore: sortedPlaylists.length > ITEMS_PER_PAGE,
	};
}

export default getPlaylists;

export async function getAllPlaylists(channel: TextBasedChannel) {
	const rawMessages = await channel.messages.fetch({
		limit: 100,
		cache: false,
	});
	const messages = rawMessages.map((message) => message.content);

	const allPlaylistsWithCache = await Promise.all(
		messages
			.flatMap((message) => {
				const match = /id="(?<id>.+)"/.exec(message);
				const id = match?.groups?.id;

				if (!id) {
					return [];
				}

				const cleanContent = cleanUpPlaylistContent(message);
				const songs = cleanContent ? cleanContent.split('\n') : [];

				return { id, songs };
			})
			.map(async ({ id, songs }) => ({
				id,
				description: await getPlaylistDescription(songs),
			})),
	);

	const sortedPlaylists = allPlaylistsWithCache.sort(({ id: a }, { id: b }) =>
		a.localeCompare(b, 'en', { sensitivity: 'base' }),
	);

	return sortedPlaylists.map(({ id, description }) => ({
		name: `${id} - ${description}`,
		value: id,
	}));
}

async function getPlaylistDescription(songs: string[]) {
	const spotifyPlaylists = songs.filter(isUrlSpotifyPlaylist);

	if (spotifyPlaylists.length > 0) {
		const spotifyPlaylistData = await Promise.all(
			spotifyPlaylists.map(async (playlistUrl) => {
				const metadata = await externalPlaylistCache.getTrackCount(playlistUrl);

				if (metadata) {
					return {
						trackCount: metadata.trackCount,
						cachedAt: metadata.cachedAt,
					};
				}

				return null;
			}),
		);

		const resolvedData = spotifyPlaylistData.filter((data) => data !== null);
		const totalSpotifyTracks = resolvedData.reduce(
			(sum, data) => sum + data.trackCount,
			0,
		);
		const unresolvedPlaylistsCount =
			spotifyPlaylists.length - resolvedData.length;

		const adjustedSongsLength = songs.length - spotifyPlaylists.length;
		const totalResolvedSongs = totalSpotifyTracks + adjustedSongsLength;

		if (totalResolvedSongs === 0 && unresolvedPlaylistsCount > 0) {
			const playlistWord =
				pluralizePlaylist`${unresolvedPlaylistsCount} ${null}`.replace(
					`${unresolvedPlaylistsCount} `,
					'',
				);
			return `${unresolvedPlaylistsCount} unresolved external ${playlistWord}`;
		}

		let description = pluralizeSongs`${totalResolvedSongs} ${null}`;

		if (resolvedData.length > 0) {
			const oldestDate = resolvedData.reduce((oldest, current) => {
				return new Date(current.cachedAt) < new Date(oldest.cachedAt)
					? current
					: oldest;
			});

			const formattedDate = externalPlaylistCache.formatCacheDate(
				oldestDate.cachedAt,
			);

			description += ` (as of ${formattedDate})`;
		}

		if (unresolvedPlaylistsCount > 0) {
			const playlistWord =
				pluralizePlaylist`${unresolvedPlaylistsCount} ${null}`.replace(
					`${unresolvedPlaylistsCount} `,
					'',
				);
			description += ` (+ ${unresolvedPlaylistsCount} unresolved external ${playlistWord})`;
		}

		return description;
	}

	return pluralizeSongs`${songs.length} ${null}`;
}
