import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import type { Client } from 'discord.js';
import {
	InterceptedStream,
	onBeforeCreateStream,
	onStreamExtracted,
	Player,
} from 'discord-player';
import { SpotifyExtractor } from 'discord-player-spotify';
import { YoutubeiExtractor } from 'discord-player-youtubei';
import defineCustomFilters from './defineCustomFilters';
import getOpusCacheTrackPath from './getOpusCacheTrackPath';
import logger from './logger';
import { RedisQueryCache } from './RedisQueryCache';
import redis from './redis';

const CACHE_WRITE_BUFFER_MS = 5000;

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

			try {
				const stats = await stat(filePath);

				const now = Date.now();
				const fileAge = now - stats.mtime.getTime();

				if (fileAge < CACHE_WRITE_BUFFER_MS) {
					return null;
				}

				track.setMetadata({
					...(track.metadata ?? {}),
					isFromCache: true,
				});

				return createReadStream(filePath);
			} catch {
				return null;
			}
		});

		onStreamExtracted(async (stream, track) => {
			if (typeof stream === 'string') {
				return stream;
			}

			const isReadable = stream instanceof Readable;
			const readable = isReadable ? stream : stream.stream;
			const interceptor = new InterceptedStream();

			const filePath = getOpusCacheTrackPath(track.url);

			try {
				const writeStream = createWriteStream(filePath);

				writeStream.on('error', (error) => {
					logger.error('Opus cache write stream error', error);
				});

				interceptor.interceptors.add(writeStream);

				if (isReadable) {
					return readable.pipe(interceptor);
				}

				return {
					stream: readable.pipe(interceptor),
					$fmt: stream.$fmt,
				};
			} catch (error) {
				logger.error('Failed to create opus cache write stream', error);

				if (isReadable) {
					return readable;
				}

				return stream;
			}
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
