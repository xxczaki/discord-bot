import { Player } from 'discord-player';
import type { Client } from 'discord.js';
import { RedisQueryCache } from './RedisQueryCache';

import redis from './redis';
import getEnvironmentVariable from './getEnvironmentVariable';

let initializedPlayer: Player;

export default async function getInitializedPlayer(client: Client<boolean>) {
	if (!initializedPlayer) {
		initializedPlayer = new Player(client, {
			skipFFmpeg: true,
			queryCache: new RedisQueryCache(redis),
			ytdlOptions: {
				requestOptions: {
					headers: {
						cookie: getEnvironmentVariable('YOUTUBE_COOKIES'),
					},
				},
			},
		});

		await initializedPlayer.extractors.loadDefault(extractor =>
			['SpotifyExtractor', 'YouTubeExtractor'].includes(extractor),
		);
	}

	return initializedPlayer;
}
