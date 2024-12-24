import {
	SoundCloudExtractor,
	SpotifyExtractor,
	BridgeProvider,
	BridgeSource
} from '@discord-player/extractor';
import { Player, } from 'discord-player';
import { YoutubeiExtractor } from 'discord-player-youtubei';
import type { Client } from 'discord.js';
import { RedisQueryCache } from './RedisQueryCache';
import defineCustomFilters from './defineCustomFilters';
import redis from './redis';

const bridgeProvider = new BridgeProvider(BridgeSource.SoundCloud);

let initializedPlayer: Player;

defineCustomFilters();

export default async function getInitializedPlayer(client: Client<boolean>) {
	if (!initializedPlayer) {
		initializedPlayer = new Player(client, {
			queryCache: new RedisQueryCache(redis),
			bridgeProvider,
		});

		await initializedPlayer.extractors.register(SpotifyExtractor, {});
		await initializedPlayer.extractors.register(YoutubeiExtractor, {});
		await initializedPlayer.extractors.register(SoundCloudExtractor, {});
		await initializedPlayer.extractors.loadDefault((extractor) =>
			['SpotifyExtractor', 'YoutubeiExtractor', 'SoundCloudExtractor'].includes(
				extractor,
			),
		);
	}

	return initializedPlayer;
}
