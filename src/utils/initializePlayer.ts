import { AudioFilters, type Player } from 'discord-player';
import type { Client } from 'discord.js';
import getEnvironmentVariable from './getEnvironmentVariable';

let initializedPlayer: Player;

// Internal normalizer
AudioFilters.define('normalize', 'loudnorm=I=-14:LRA=11:TP=-1');

export default async function getInitializedPlayer(client: Client<boolean>) {
	if (!initializedPlayer) {
		const [{ Player }, { RedisQueryCache }, { default: redis }] =
			await Promise.all([
				import('discord-player'),
				import('./RedisQueryCache'),
				import('./redis'),
			]);

		initializedPlayer = new Player(client, {
			queryCache: new RedisQueryCache(redis),
			ytdlOptions: {
				requestOptions: {
					headers: {
						cookie: getEnvironmentVariable('YOUTUBE_COOKIE'),
					},
				},
			},
		});

		await initializedPlayer.extractors.loadDefault((extractor) =>
			['SpotifyExtractor', 'YouTubeExtractor'].includes(extractor),
		);
	}

	return initializedPlayer;
}
