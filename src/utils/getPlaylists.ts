import {
	StringSelectMenuOptionBuilder,
	type TextBasedChannel,
} from 'discord.js';
import cleanUpPlaylistContent from './cleanUpPlaylistContent';
import isUrlSpotifyPlaylist from './isUrlSpotifyPlaylist';
import pluralize from './pluralize';
import redis from './redis';

const pluralizeSongs = pluralize('song', 'songs');
const pluralizePlaylist = pluralize('playlist', 'playlists');

async function getPlaylists(channel: TextBasedChannel) {
	const rawMessages = await channel.messages.fetch({ limit: 50, cache: false });
	const messages = rawMessages.map((message) => message.content);

	const playlistsWithCache = await Promise.all(
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
			.slice(0, 25)
			.map(async ({ id, songs }) => ({
				id,
				description: await getPlaylistDescription(songs),
			})),
	);

	return playlistsWithCache
		.sort(({ id: a }, { id: b }) => a.charCodeAt(0) - b.charCodeAt(0))
		.map(({ id, description }) =>
			new StringSelectMenuOptionBuilder()
				.setLabel(id)
				.setDescription(description)
				.setValue(id),
		);
}

export default getPlaylists;

async function getPlaylistDescription(songs: string[]) {
	const spotifyPlaylists = songs.filter(isUrlSpotifyPlaylist);

	if (spotifyPlaylists.length > 0) {
		const spotifyTrackCounts = await Promise.all(
			spotifyPlaylists.map(async (playlistUrl) => {
				const cacheKey = `discord-player:query-cache:${playlistUrl}`;

				try {
					const cachedData = await redis.get(cacheKey);

					if (cachedData) {
						const tracks = JSON.parse(cachedData);

						return Array.isArray(tracks) ? tracks.length : 0;
					}
				} catch {}

				return null;
			}),
		);

		const resolvedCounts = spotifyTrackCounts.filter((count) => count !== null);
		const totalSpotifyTracks = resolvedCounts.reduce(
			(sum, count) => sum + count,
			0,
		);
		const unresolvedPlaylistsCount =
			spotifyPlaylists.length - resolvedCounts.length;

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
