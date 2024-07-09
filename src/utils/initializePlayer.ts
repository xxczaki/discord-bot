import { AudioFilters, type Player } from 'discord-player';
import type { Client } from 'discord.js';

let initializedPlayer: Player;

// Internal normalizer
AudioFilters.define('normalize', 'loudnorm=I=-14:LRA=11:TP=-1');

export default async function getInitializedPlayer(client: Client<boolean>) {
	if (!initializedPlayer) {
		const [
			{ Player },
			{ BridgeProvider, BridgeSource },
			{ RedisQueryCache },
			{ default: redis },
		] = await Promise.all([
			import('discord-player'),
			import('@discord-player/extractor'),
			import('./RedisQueryCache'),
			import('./redis'),
		]);

		const bridgeProvider = new BridgeProvider(BridgeSource.SoundCloud);

		initializedPlayer = new Player(client, {
			queryCache: new RedisQueryCache(redis),
			bridgeProvider,
		});

		await initializedPlayer.extractors.loadDefault((extractor) =>
			[
				'SpotifyExtractor',
				'AppleMusicExtractor',
				'SoundCloudExtractor',
			].includes(extractor),
		);
	}

	return initializedPlayer;
}
