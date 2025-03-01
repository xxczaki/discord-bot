import { captureException } from '@sentry/node';
import { useMainPlayer, useQueue } from 'discord-player';
import type { CacheType, Interaction } from 'discord.js';
import Fuse from 'fuse.js';
import debounce from 'p-debounce';
import determineSearchEngine from '../utils/determineSearchEngine';
import getTrackPosition from '../utils/getTrackPosition';
import logger from '../utils/logger';
import truncateString from '../utils/truncateString';

async function useAutocompleteHandler(interaction: Interaction<CacheType>) {
	if (!interaction.isAutocomplete() || interaction.responded) {
		return;
	}

	if (interaction.commandName === 'play') {
		const query = interaction.options.getString('query', true);

		if (query.length === 0) return interaction.respond([]);

		try {
			const player = useMainPlayer();

			const data = await player.search(query, {
				searchEngine: determineSearchEngine(query),
				fallbackSearchEngine: 'youtubeSearch',
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
		} catch (error) {
			logger.error(error, 'Search autocomplete fail');
			captureException(error);

			return interaction.respond([]);
		}
	}

	if (
		interaction.commandName === 'remove' ||
		interaction.commandName === 'move'
	) {
		const queue = useQueue();
		const currentTrack = queue?.currentTrack;

		if (!queue || queue.isEmpty() || !currentTrack)
			return interaction.respond([]);

		const tracks = [currentTrack, ...queue.tracks.toArray()];
		const list = tracks.map((track, index) => {
			const position = index === 0 ? 1 : getTrackPosition(queue, track) + 2;

			return {
				name: `${position}. "${truncateString(track.title, 40)}" by ${truncateString(
					track.author,
					40,
				)}`,
				value: position.toString(),
			};
		});

		const fuse = new Fuse(list, { keys: ['name'] });

		const query = interaction.options.getString('query', true);

		if (!query) {
			return interaction.respond(list.slice(0, 25));
		}

		const matches = fuse.search(query);
		const results = matches.slice(0, 25).map(({ item }) => item);

		return interaction.respond(results);
	}
}

export default debounce(useAutocompleteHandler, 250);
