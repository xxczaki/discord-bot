import {
	StringSelectMenuOptionBuilder,
	type TextBasedChannel,
} from 'discord.js';
import sampleSize from 'lodash.samplesize';
import cleanUpPlaylistContent from './cleanUpPlaylistContent';

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
			const samples = sampleSize(
				songs.filter((song) => /https?:\/\//.exec(song)),
				3,
			)
				.map((sample) => `"${sample}"`)
				.join(', ');

			return new StringSelectMenuOptionBuilder()
				.setLabel(id)
				.setDescription(
					`${getNumberOfSongs(songs.length)}, including: ${samples}.`,
				)
				.setValue(id);
		})
		.slice(0, 25);
}

function getNumberOfSongs(number: number) {
	return `${number} ${number === 1 ? 'song' : 'songs'}`;
}
