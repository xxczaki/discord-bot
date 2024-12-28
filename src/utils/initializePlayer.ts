import {
	SoundCloudExtractor,
	SpotifyExtractor,
} from '@discord-player/extractor';
import { Player } from 'discord-player';
import { YoutubeiExtractor } from 'discord-player-youtubei';
import type { Client } from 'discord.js';
import { RedisQueryCache } from './RedisQueryCache';
import defineCustomFilters from './defineCustomFilters';
import redis from './redis';

let initializedPlayer: Player;

defineCustomFilters();

export default async function getInitializedPlayer(client: Client<boolean>) {
	if (!initializedPlayer) {
		initializedPlayer = new Player(client, {
			queryCache: new RedisQueryCache(redis),
		});

		await initializedPlayer.extractors.register(SpotifyExtractor, {});
		await initializedPlayer.extractors.register(SoundCloudExtractor, {});
		await initializedPlayer.extractors.register(YoutubeiExtractor, {
			innertubeConfigRaw: {
				lang: 'pl',
				location: 'PL',
				generate_session_locally: true,
			},
		});
		await initializedPlayer.extractors.loadDefault((extractor) =>
			['YoutubeiExtractor', 'SpotifyExtractor', 'SoundCloudExtractor'].includes(
				extractor,
			),
		);
	}

	return initializedPlayer;
}
