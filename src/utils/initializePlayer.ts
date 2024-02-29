import { Player, AudioFilters } from 'discord-player';
import type { Client } from 'discord.js';
import { RedisQueryCache } from './RedisQueryCache';

import redis from './redis';

let initializedPlayer: Player;

// Internal normalizer
AudioFilters.define('normalize', 'loudnorm=I=-14:LRA=11:TP=-1');

export default async function getInitializedPlayer(client: Client<boolean>) {
	if (!initializedPlayer) {
		initializedPlayer = new Player(client, {
			queryCache: new RedisQueryCache(redis),
		});

		await initializedPlayer.extractors.loadDefault(extractor =>
			['SpotifyExtractor', 'YouTubeExtractor'].includes(extractor),
		);
	}

	return initializedPlayer;
}
