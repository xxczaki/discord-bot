import type { Channel } from 'discord.js';
import Fuse from 'fuse.js';

export default async function getPlaylists(
	channel: Channel | undefined,
	query: string | null,
) {
	if (!channel?.isTextBased()) {
		return [];
	}

	const rawMessages = await channel.messages.fetch({ limit: 25, cache: true });
	const messages = rawMessages.map(message => message.content);

	const fuse = new Fuse(messages);
	let matching: Array<{ item: string }> = query ? fuse.search(query) : [];

	if (query && !matching) return [];

	if (matching.length === 0) {
		matching = messages.map(content => ({ item: content }));
	}

	return matching
		.flatMap(message => {
			const match = /id="(?<id>.+)"/.exec(message.item)!;
			const id = match?.groups!.id;

			if (!id) {
				return [];
			}

			return {
				name: id,
				value: id,
			};
		})
		.slice(0, 25);
}
