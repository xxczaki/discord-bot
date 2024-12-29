import { useMainPlayer, useQueue } from 'discord-player';
import type { CacheType, Interaction } from 'discord.js';
import Fuse from 'fuse.js';
import getTrackPosition from '../utils/getTrackPosition';
import truncateString from '../utils/truncateString';

const FUSE_CACHE_TTL_MS = 1000 * 60; // 1 minute

let fuse:
	| {
			instance: Fuse<{
				name: string;
				value: string;
			}>;
			ttl: number;
	  }
	| undefined;

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

		const data = await player.search(query.replace('!sc', ''), {
			searchEngine: query.startsWith('!sc')
				? 'soundcloudSearch'
				: 'spotifySearch',
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
				)} (*${track.duration}*)`,
				value: track.url,
			}));

		return interaction.respond(results);
	}

	if (
		interaction.commandName === 'remove' ||
		interaction.commandName === 'move'
	) {
		const queue = useQueue(interaction.guild?.id ?? '');
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
				)} (*${track.duration}*)`,
				value: position.toString(),
			};
		});

		if (!fuse || Date.now() - fuse.ttl > FUSE_CACHE_TTL_MS) {
			fuse = {
				instance: new Fuse(list, { keys: ['name'] }),
				ttl: Date.now(),
			};
		}

		const query = interaction.options.getString('query', true);

		if (!query) {
			return interaction.respond(list.slice(0, 25));
		}

		const matches = fuse.instance.search(query);
		const results = matches.slice(0, 25).map(({ item }) => item);

		return interaction.respond(results);
	}
}
