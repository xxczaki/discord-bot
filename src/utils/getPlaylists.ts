import {
	StringSelectMenuOptionBuilder,
	type TextBasedChannel,
} from 'discord.js';
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

			return { id, entriesNo: songs.length };
		})
		.slice(0, 25)
		.sort(({ id: a }, { id: b }) => a.charCodeAt(0) - b.charCodeAt(0))
		.map(({ id, entriesNo }) =>
			new StringSelectMenuOptionBuilder()
				.setLabel(id)
				.setDescription(getNumberOfSongs(entriesNo))
				.setValue(id),
		);
}

function getNumberOfSongs(number: number) {
	return `${number} ${number === 1 ? 'song' : 'songs'}`;
}
