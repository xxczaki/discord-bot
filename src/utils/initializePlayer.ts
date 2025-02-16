import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { Readable } from 'node:stream';
import {
	AttachmentExtractor,
	SpotifyExtractor,
} from '@discord-player/extractor';
import {
	InterceptedStream,
	Player,
	onBeforeCreateStream,
	onStreamExtracted,
} from 'discord-player';
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

		onBeforeCreateStream(async (track) => {
			const filePath = `/opus-cache/${Buffer.from(track.url).toString('base64url')}.opus`;

			if (existsSync(filePath)) {
				track.setMetadata({ isFromCache: true });

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

			const filePath = `/opus-cache/${Buffer.from(track.url).toString('base64url')}.opus`;

			interceptor.interceptors.add(createWriteStream(filePath));

			if (isReadable) {
				return readable.pipe(interceptor);
			}

			return {
				stream: readable.pipe(interceptor),
				$fmt: stream.$fmt,
			};
		});

		await initializedPlayer.extractors.register(YoutubeiExtractor, {});
		await initializedPlayer.extractors.register(SpotifyExtractor, {});
		await initializedPlayer.extractors.register(AttachmentExtractor, {});

		await initializedPlayer.extractors.loadMulti([
			YoutubeiExtractor,
			SpotifyExtractor,
			AttachmentExtractor,
		]);
	}

	return initializedPlayer;
}
