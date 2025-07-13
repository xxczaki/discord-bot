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
import deleteOpusCacheEntry from './deleteOpusCacheEntry';
import getOpusCacheTrackPath from './getOpusCacheTrackPath';
import logger from './logger';
import { RedisQueryCache } from './RedisQueryCache';
import redis from './redis';

const CACHE_WRITE_BUFFER_MS = 5000;
const MIN_CACHE_FILE_SIZE_BYTES = 1024; // 1KB

let initializedPlayer: Player;

const activeWrites = new Set<string>();

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

			if (activeWrites.has(filePath)) {
				return null;
			}

			try {
				const stats = await stat(filePath);

				const now = Date.now();
				const fileAge = now - stats.mtime.getTime();

				if (fileAge < CACHE_WRITE_BUFFER_MS) {
					return null;
				}

				if (stats.size < MIN_CACHE_FILE_SIZE_BYTES) {
					logger.warn('Deleting undersized cache file', {
						filePath,
						size: stats.size,
					});

					void deleteOpusCacheEntry(track.url);

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
				activeWrites.add(filePath);

				const writeStream = createWriteStream(filePath);

				const cleanup = async () => {
					activeWrites.delete(filePath);
					void deleteOpusCacheEntry(track.url);
				};

				writeStream.on('error', async (error) => {
					logger.error('Opus cache write stream error', error);
					await cleanup();
				});

				writeStream.on('close', () => {
					activeWrites.delete(filePath);
				});

				readable.on('error', async () => {
					await cleanup();
				});

				readable.on('close', () => {
					if (activeWrites.has(filePath)) {
						void cleanup();
					}
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
				activeWrites.delete(filePath);

				logger.error('Failed to create opus cache write stream', error);

				if (isReadable) {
					return readable;
				}

				return stream;
			}
		});

		/* v8 ignore start */
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
		/* v8 ignore stop */
	}

	return initializedPlayer;
}
