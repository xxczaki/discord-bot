import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { Readable } from 'node:stream';
import {
	InterceptedStream,
	Player,
	onBeforeCreateStream,
	onStreamExtracted,
} from 'discord-player';
import { SpotifyExtractor } from 'discord-player-spotify';
import { YoutubeiExtractor } from 'discord-player-youtubei';
import type { Client } from 'discord.js';
import { RedisQueryCache } from './RedisQueryCache';
import defineCustomFilters from './defineCustomFilters';
import getOpusCacheTrackPath from './getOpusCacheTrackPath';
import redis from './redis';

let initializedPlayer: Player;

defineCustomFilters();

export default async function getInitializedPlayer(client: Client<boolean>) {
	if (!initializedPlayer) {
		initializedPlayer = new Player(client, {
			queryCache: new RedisQueryCache(redis),
		});

		/*
			See:
			- https://github.com/Androz2091/discord-player/discussions/1962
			- https://github.com/Androz2091/discord-player/discussions/1985
		*/
		onBeforeCreateStream(async (track) => {
			const filePath = getOpusCacheTrackPath(track.url);

			if (existsSync(filePath)) {
				track.setMetadata({
					...(track.metadata ?? {}),
					isFromCache: true,
				});

				return createReadStream(filePath);
			}

			return null;
		});

		onStreamExtracted(async (stream, track) => {
			if (typeof stream === 'string') {
				return stream;
			}

			const isReadable = stream instanceof Readable;
			const readable = isReadable ? stream : stream.stream;
			const interceptor = new InterceptedStream();

			const filePath = getOpusCacheTrackPath(track.url);

			interceptor.interceptors.add(createWriteStream(filePath));

			if (isReadable) {
				return readable.pipe(interceptor);
			}

			return {
				stream: readable.pipe(interceptor),
				$fmt: stream.$fmt,
			};
		});

		await initializedPlayer.extractors.register(YoutubeiExtractor, {
			streamOptions: {
				useClient: 'WEB_EMBEDDED',
			},
			generateWithPoToken: true,
		});
		await initializedPlayer.extractors.register(SpotifyExtractor, {
			market: 'PL',
		});

		await initializedPlayer.extractors.loadMulti([
			YoutubeiExtractor,
			SpotifyExtractor,
		]);
	}

	return initializedPlayer;
}
