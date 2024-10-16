import { BridgeProvider, BridgeSource } from '@discord-player/extractor';
import { AudioFilters, type Player } from 'discord-player';
import type { Client } from 'discord.js';

let initializedPlayer: Player;

// Internal normalizer
AudioFilters.define('normalize', 'loudnorm=I=-14:LRA=11:TP=-1');

const bridgeProvider = new BridgeProvider(BridgeSource.SoundCloud);

export default async function getInitializedPlayer(client: Client<boolean>) {
	if (!initializedPlayer) {
		const [
			{ Player },
			{ RedisQueryCache },
			{ default: redis },
			{ YoutubeiExtractor },
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
			bridgeProvider,
		});

		await initializedPlayer.extractors.register(YoutubeiExtractor, {
			streamOptions: {
				useClient: "ANDROID"
			}
		});
		await initializedPlayer.extractors.register(SpotifyExtractor, {});
		await initializedPlayer.extractors.loadDefault((extractor) =>
			['SpotifyExtractor', 'YoutubeiExtractor'].includes(extractor),
		);
	}

	return initializedPlayer;
}
