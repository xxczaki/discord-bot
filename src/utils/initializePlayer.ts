import {
	AppleMusicExtractor,
	BridgeProvider,
	BridgeSource,
	SpotifyExtractor,
} from '@discord-player/extractor';
import { AudioFilters, Player } from 'discord-player';
import { YoutubeiExtractor } from 'discord-player-youtubei';
import type { Client } from 'discord.js';
import { RedisQueryCache } from './RedisQueryCache';
import redis from './redis';

let initializedPlayer: Player;

const bridgeProvider = new BridgeProvider(BridgeSource.SoundCloud);

// Internal normalizer
AudioFilters.define('normalize', 'loudnorm=I=-14:LRA=11:TP=-1');

export default async function getInitializedPlayer(client: Client<boolean>) {
	if (!initializedPlayer) {
		initializedPlayer = new Player(client, {
			queryCache: new RedisQueryCache(redis),
			bridgeProvider,
		});

		await initializedPlayer.extractors.register(AppleMusicExtractor, {});
		await initializedPlayer.extractors.register(SpotifyExtractor, {});
		await initializedPlayer.extractors.register(YoutubeiExtractor, {});
		await initializedPlayer.extractors.loadDefault((extractor) =>
			['AppleMusicExtractor', 'SpotifyExtractor', 'YoutubeiExtractor'].includes(extractor),
		);
	}

	return initializedPlayer;
}
