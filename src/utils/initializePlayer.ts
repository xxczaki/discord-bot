import { AudioFilters, type Player } from 'discord-player';
import type { Client } from 'discord.js';

let initializedPlayer: Player;

// Internal normalizer
AudioFilters.define('normalize', 'loudnorm=I=-14:LRA=11:TP=-1');

export default async function getInitializedPlayer(client: Client<boolean>) {
	if (!initializedPlayer) {
		const [
			{ Player },
			{ RedisQueryCache },
			{ default: redis },
			{ createYoutubeiStream, YoutubeiExtractor },
			{ SpotifyExtractor },
		] = await Promise.all([
			import('discord-player'),
			import('./RedisQueryCache'),
			import('./redis'),
			import('discord-player-youtubei'),
			import('@discord-player/extractor'),
		]);

		initializedPlayer = new Player(client, {
			queryCache: new RedisQueryCache(redis),
		});

		await initializedPlayer.extractors.register(YoutubeiExtractor, {});
		await initializedPlayer.extractors.register(SpotifyExtractor, {
			createStream: createYoutubeiStream,
		});
		await initializedPlayer.extractors.loadDefault((extractor) =>
			['SpotifyExtractor', 'YoutubeiExtractor'].includes(extractor),
		);
	}

	return initializedPlayer;
}
