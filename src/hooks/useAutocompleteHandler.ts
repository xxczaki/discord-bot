import { useMainPlayer } from 'discord-player';
import type { CacheType, Interaction } from 'discord.js';
import Fuse from 'fuse.js';
import truncateString from '../utils/truncateString';
import { PLAYLISTS_CHANNEL_ID } from '../constants/channelIds';

export default async function useAutocompleteHandler(
	interaction: Interaction<CacheType>,
) {
	if (!interaction.isAutocomplete()) {
		return;
	}

	const query = interaction.options.getString('query');

	if (query) {
		const player = useMainPlayer();

		if (query.length === 0) return interaction.respond([]);

		const data = await player.search(query, { requestedBy: interaction.user });

		if (!data.hasTracks()) return interaction.respond([]);

		const results = data.tracks
			.filter(track => track.url.length < 100)
			.slice(0, 10)
			.map(track => ({
				name: `"${truncateString(track.title, 40)}" by ${truncateString(
					track.author,
					40,
				)} (${track.duration})`,
				value: track.url,
			}));

		return interaction.respond(results);
	}

	const identifier = interaction.options.getString('id', true);

	if (identifier.length === 0) return interaction.respond([]);

	const channel = interaction.client.channels.cache.get(PLAYLISTS_CHANNEL_ID);

	if (channel && channel.isTextBased()) {
		const messages = await channel.messages.fetch({ limit: 20, cache: true });
		const fuse = new Fuse(messages.map(message => message.content));
		const matching = fuse.search(identifier);

		if (!matching) return interaction.respond([]);

		const results = matching
			.map(message => {
				const match = /id="(?<id>.+)"/.exec(message.item)!;
				const id = match.groups!.id;

				return {
					name: id,
					value: id,
				};
			})
			.slice(0, 10);

		return interaction.respond(results);
	}
}
