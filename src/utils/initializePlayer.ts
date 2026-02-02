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
import { YoutubeSabrExtractor } from 'discord-player-googlevideo';
import { SpotifyExtractor } from 'discord-player-spotify';
import defineCustomFilters from './defineCustomFilters';
import logger from './logger';
import { OpusCacheManager } from './OpusCacheManager';
import { RedisQueryCache } from './RedisQueryCache';
import redis from './redis';

const CACHE_WRITE_BUFFER_MS = 5000;
const MIN_CACHE_FILE_SIZE_BYTES = 1024;

/*
	YouTube streams Opus audio at ~128-136 kbps (~17 KB/s).
	We use this to estimate expected file size from track duration
	and detect corrupted cache files (e.g., from interrupted downloads).
*/
const EXPECTED_BYTES_PER_SECOND = 17_000;
const MIN_CACHE_SIZE_RATIO = 0.8;

let initializedPlayer: Player;

const activeWrites = new Set<string>();
const opusCacheManager = OpusCacheManager.initialize();

defineCustomFilters();

export default async function getInitializedPlayer(client: Client<boolean>) {
	if (!initializedPlayer) {
		initializedPlayer = new Player(client, {
			queryCache: new RedisQueryCache(redis),
		});

		await opusCacheManager.scan();

		/*
			See:
			- https://github.com/Androz2091/discord-player/discussions/1962
			- https://github.com/Androz2091/discord-player/discussions/1985
		*/
		onBeforeCreateStream(async (track) => {
			const durationSeconds = Math.round(track.durationMS / 1000);
			const matchedEntry = opusCacheManager.findMatch(
				track.cleanTitle,
				track.author,
				durationSeconds,
			);

			if (!matchedEntry) {
				return null;
			}

			const filePath = opusCacheManager.getFilePath(matchedEntry.filename);

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
					logger.warn(
						{
							filePath,
							size: stats.size,
						},
						'Deleting undersized cache file',
					);

					void opusCacheManager.deleteEntry(matchedEntry.filename);

					return null;
				}

				if (track.durationMS > 0) {
					const expectedSize =
						(track.durationMS / 1000) * EXPECTED_BYTES_PER_SECOND;
					const minValidSize = expectedSize * MIN_CACHE_SIZE_RATIO;

					if (stats.size < minValidSize) {
						logger.warn(
							{
								filePath,
								actualSize: stats.size,
								expectedSize: Math.round(expectedSize),
								durationMS: track.durationMS,
							},
							'Deleting corrupted cache file',
						);

						void opusCacheManager.deleteEntry(matchedEntry.filename);

						track.setMetadata({
							...(track.metadata ?? {}),
							cacheInvalidated: true,
						});

						return null;
					}
				}

				track.setMetadata({
					...(track.metadata ?? {}),
					isFromCache: true,
					cacheFilename: matchedEntry.filename,
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

			if (
				track.metadata &&
				typeof track.metadata === 'object' &&
				'isFromCache' in track.metadata &&
				track.metadata.isFromCache
			) {
				if (isReadable) {
					return readable;
				}

				return stream;
			}

			const interceptor = new InterceptedStream();

			const trackMetadata = {
				title: track.cleanTitle,
				author: track.author,
				durationMS: track.durationMS,
			};
			const filename = opusCacheManager.generateFilename(trackMetadata);
			const filePath = opusCacheManager.getFilePath(filename);

			try {
				activeWrites.add(filePath);

				const writeStream = createWriteStream(filePath);

				let streamEndedNormally = false;

				const cleanup = () => {
					interceptor.interceptors.delete(writeStream);

					if (!writeStream.destroyed) {
						writeStream.destroy();
					}

					activeWrites.delete(filePath);
					void opusCacheManager.deleteEntry(filename);
				};

				writeStream.on('error', (error) => {
					logger.error(error, 'Opus cache write stream error');
					cleanup();
				});

				writeStream.on('close', () => {
					activeWrites.delete(filePath);

					opusCacheManager.addEntry({
						filename,
						title: trackMetadata.title,
						author: trackMetadata.author,
						durationSeconds: Math.round(trackMetadata.durationMS / 1000),
					});
				});

				readable.on('error', () => {
					cleanup();
				});

				readable.on('end', () => {
					streamEndedNormally = true;
				});

				readable.on('close', () => {
					if (!streamEndedNormally && activeWrites.has(filePath)) {
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

				logger.error(error, 'Failed to create opus cache write stream');

				if (isReadable) {
					return readable;
				}

				return stream;
			}
		});

		/* v8 ignore start */
		await initializedPlayer.extractors.register(YoutubeSabrExtractor, {});
		await initializedPlayer.extractors.register(SpotifyExtractor, {
			market: 'PL',
		});

		await initializedPlayer.extractors.loadMulti([
			YoutubeSabrExtractor,
			SpotifyExtractor,
		]);
		/* v8 ignore stop */
	}

	return initializedPlayer;
}
