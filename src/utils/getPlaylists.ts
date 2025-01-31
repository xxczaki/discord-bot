import {
	StringSelectMenuOptionBuilder,
	type TextBasedChannel,
} from 'discord.js';
import cleanUpPlaylistContent from './cleanUpPlaylistContent';
import isUrlSpotifyPlaylist from './isUrlSpotifyPlaylist';

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
				? `(+ ${pluralize(adjustedSongsLength, 'song', 'songs')})`
				: '';

		return `${pluralize(spotifyPlaylists.length, 'Spotify playlist', 'Spotify playlists')} ${numberOfSongs}`.trim();
	}

	return pluralize(songs.length, 'song', 'songs');
}

function pluralize(number: number, ifOne: string, ifMany: string) {
	if (number === 1) {
		return `${number} ${ifOne}`;
	}

	return `${number} ${ifMany}`;
}
