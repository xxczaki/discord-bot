import type { CacheType, Interaction } from 'discord.js';

export default async function useAutocompleteHandler(
	interaction: Interaction<CacheType>,
) {
	if (!interaction.isAutocomplete()) {
		return;
	}

	if (interaction.commandName === 'play') {
		const query = interaction.options.getString('query', true);

		if (query.length === 0) return interaction.respond([]);

		const [{ useMainPlayer }, { default: isYouTubeLink }] = await Promise.all([
			import('discord-player'),
			import('../utils/isYouTubeLink'),
		]);

		const player = useMainPlayer();

		const data = await player.search(query, {
			searchEngine: isYouTubeLink(query) ? 'youtubeVideo' : 'spotifySearch',
			requestedBy: interaction.user,
		});

		if (!data.hasTracks()) return interaction.respond([]);

		const { default: truncateString } = await import('../utils/truncateString');

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
