import {
	StringSelectMenuOptionBuilder,
	type TextBasedChannel,
} from 'discord.js';
import cleanUpPlaylistContent from './cleanUpPlaylistContent';
import isUrlSpotifyPlaylist from './isUrlSpotifyPlaylist';
import pluralize from './pluralize';

const pluralizeSongs = pluralize('song', 'songs');

export default async function getPlaylists(channel: TextBasedChannel) {
	const rawMessages = await channel.messages.fetch({ limit: 25, cache: true });
	const messages = rawMessages.map((message) => message.content);

	return messages
		.flatMap((message) => {
			const match = /id="(?<id>.+)"/.exec(message);
			const id = match?.groups?.id;

			if (!id) {
				return [];
			}

			const songs = cleanUpPlaylistContent(message).split('\n');

			return { id, description: getPlaylistDescription(songs) };
		})
		.slice(0, 25)
		.sort(({ id: a }, { id: b }) => a.charCodeAt(0) - b.charCodeAt(0))
		.map(({ id, description }) =>
			new StringSelectMenuOptionBuilder()
				.setLabel(id)
				.setDescription(description)
				.setValue(id),
		);
}

function getPlaylistDescription(songs: string[]) {
	const spotifyPlaylists = songs.filter(isUrlSpotifyPlaylist);

	if (spotifyPlaylists.length > 0) {
		const adjustedSongsLength = songs.length - spotifyPlaylists.length;
		const numberOfSongs =
			adjustedSongsLength > 0
				? pluralizeSongs`(+ ${adjustedSongsLength} ${null})`
				: '';

		return pluralize(
			'Spotify playlist',
			'Spotify playlists',
		)`${spotifyPlaylists.length} ${null} ${numberOfSongs}`.trim();
	}

	return pluralizeSongs`${songs.length} ${null}`;
}
