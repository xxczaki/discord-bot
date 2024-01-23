import { useMainPlayer } from 'discord-player';
import type { CacheType, Interaction } from 'discord.js';
import truncateString from '../utils/truncateString';
import { PLAYLISTS_CHANNEL_ID } from '../constants/channelIds';
import getPlaylists from '../utils/getPlaylists';

export default async function useAutocompleteHandler(
	interaction: Interaction<CacheType>,
) {
	if (!interaction.isAutocomplete()) {
		return;
	}

	if (interaction.commandName === 'play') {
		const query = interaction.options.getString('query', true);

		if (query.length === 0) return interaction.respond([]);

		const player = useMainPlayer();

		const data = await player.search(query, { requestedBy: interaction.user });

		if (!data.hasTracks()) return interaction.respond([]);

		const results = data.tracks
			.filter(track => track.url.length < 100)
			.slice(0, 25)
			.map(track => ({
				name: `"${truncateString(track.title, 40)}" by ${truncateString(
					track.author,
					40,
				)} (${track.duration})`,
				value: track.url,
			}));

		return interaction.respond(results);
	}

	const identifier = interaction.options.getString('id');
	const channel = interaction.client.channels.cache.get(PLAYLISTS_CHANNEL_ID);

	const playlists = await getPlaylists(channel, identifier);

	return interaction.respond(playlists);
}
