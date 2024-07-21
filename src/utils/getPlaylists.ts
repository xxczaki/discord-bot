import {
	StringSelectMenuOptionBuilder,
	type TextBasedChannel,
} from 'discord.js';

export default async function getPlaylists(channel: TextBasedChannel) {
	const rawMessages = await channel.messages.fetch({ limit: 25, cache: true });
	const messages = rawMessages.map((message) => message.content);

	return messages
		.map((content) => ({ item: content }))
		.flatMap((message) => {
			const match = /id="(?<id>.+)"/.exec(message.item);
			const id = match?.groups?.id;

			if (!id) {
				return [];
			}

			return (
				new StringSelectMenuOptionBuilder()
					.setLabel(id)
					// .setDescription('The dual-type Grass/Poison Seed Pokémon.')
					.setValue(id)
			);
		})
		.slice(0, 25);
}
