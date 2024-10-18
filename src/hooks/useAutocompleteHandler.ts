import { useMainPlayer } from 'discord-player';
import type { CacheType, Interaction } from 'discord.js';
import isYouTubeLink from '../utils/isYouTubeLink';
import truncateString from '../utils/truncateString';

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

		const data = await player.search(query, {
			searchEngine: isYouTubeLink(query) ? 'youtubeVideo' : 'spotifySearch',
			requestedBy: interaction.user,
		});

		if (!data.hasTracks()) return interaction.respond([]);

		const results = data.tracks
			.filter((track) => track.url.length < 100)
			.slice(0, 25)
			.map((track) => ({
				name: `"${truncateString(track.title, 40)}" by ${truncateString(
					track.author,
					40,
				)} (${track.duration})`,
				value: track.url,
			}));

		return interaction.respond(results);
	}
}
