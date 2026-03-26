import {
	DiscordPlayerQueryResultCache,
	deserialize,
	type Playlist,
	type QueryCacheProvider,
	type QueryCacheResolverContext,
	SearchResult,
	type SerializedPlaylist,
	type SerializedTrack,
	serialize,
	type Track,
	useMainPlayer,
} from 'discord-player';
import type { Redis } from 'ioredis';
import { ExternalPlaylistCache } from './ExternalPlaylistCache';
import isUrlSpotifyPlaylist from './isUrlSpotifyPlaylist';

export interface Resolution {
	url: string;
	track: Track;
}

export class RedisQueryCache implements QueryCacheProvider<Track> {
	static EXPIRY_TIMEOUT_SECONDS = 60 * 60 * 24; // 1 day

	#externalPlaylistCache: ExternalPlaylistCache;

	constructor(public redis: Redis) {
		this.#externalPlaylistCache = new ExternalPlaylistCache(redis);
	}

	#createKey(id: string) {
		return `discord-player:query-cache:${id}` as const;
	}

	#createResolutionKey(query: string) {
		return `discord-player:query-resolutions:${query}` as const;
	}

	#createCorrectedKey(query: string) {
		return `discord-player:query-corrected:${query}` as const;
	}

	async addData(data: SearchResult): Promise<void> {
		if ((!data.tracks || data.tracks.length === 0) && !data.playlist) {
			return;
		}

		const firstTrack = data.tracks[0];

		if (firstTrack) {
			await this.redis.hset(
				this.#createResolutionKey(data.query),
				firstTrack.url,
				JSON.stringify(serialize(firstTrack)),
			);
		}

		const isCorrected = await this.redis.exists(
			this.#createCorrectedKey(data.query),
		);

		if (isCorrected) return;

		const key = this.#createKey(data.query);
		const serialized = JSON.stringify(
			data.playlist
				? serialize(data.playlist)
				: data.tracks.map((track) => serialize(track)),
		);

		await this.redis.setex(
			key,
			RedisQueryCache.EXPIRY_TIMEOUT_SECONDS,
			serialized,
		);

		if (isUrlSpotifyPlaylist(data.query)) {
			if (data.playlist) {
				await this.#externalPlaylistCache.setTrackCount(
					data.query,
					data.playlist.tracks.length,
				);
			}
		}
	}

	async getResolutions(query: string): Promise<Resolution[]> {
		const player = useMainPlayer();
		const entries = await this.redis.hgetall(this.#createResolutionKey(query));

		return Object.entries(entries).map(([url, serialized]) => ({
			url,
			track: deserialize(player, JSON.parse(serialized)) as Track,
		}));
	}

	async setCorrectResolution(query: string, trackUrl: string): Promise<void> {
		const trackData = await this.redis.hget(
			this.#createResolutionKey(query),
			trackUrl,
		);

		if (!trackData) {
			throw new Error(`No resolution found for URL: ${trackUrl}`);
		}

		await this.redis.set(this.#createCorrectedKey(query), trackData);
	}

	async setCorrectResolutionFromData(
		query: string,
		serializedTrack: string,
	): Promise<void> {
		await this.redis.set(this.#createCorrectedKey(query), serializedTrack);
	}

	async removeCorrectResolution(query: string): Promise<void> {
		await this.redis.del(this.#createCorrectedKey(query));
	}

	async isQueryCorrected(query: string): Promise<boolean> {
		const exists = await this.redis.exists(this.#createCorrectedKey(query));

		return exists === 1;
	}

	async addResolution(
		query: string,
		trackUrl: string,
		serializedTrack: string,
	): Promise<void> {
		await this.redis.hset(
			this.#createResolutionKey(query),
			trackUrl,
			serializedTrack,
		);
	}

	async getData(): Promise<DiscordPlayerQueryResultCache<Track<unknown>>[]> {
		const player = useMainPlayer();

		const results: DiscordPlayerQueryResultCache<Track<unknown>>[] = [];
		const stream = this.redis.scanStream({
			match: this.#createKey('*'),
			count: 200,
		});

		return new Promise((resolve, reject) => {
			stream.on('data', async (keys: string[] = []) => {
				stream.pause();

				if (keys.length > 0) {
					const serialized = await this.redis.mget(keys);

					for (const item of serialized) {
						if (!item) continue;

						const parsed = deserialize(player, JSON.parse(item)) as Track;
						results.push(new DiscordPlayerQueryResultCache(parsed, 0));
					}
				}

				stream.resume();
			});

			stream.on('end', () => resolve(results));
			stream.on('error', reject);
		});
	}

	async resolve(context: QueryCacheResolverContext): Promise<SearchResult> {
		const player = useMainPlayer();

		try {
			const corrected = await this.redis.get(
				this.#createCorrectedKey(context.query),
			);

			if (corrected) {
				const parsed = deserialize(player, JSON.parse(corrected)) as Track;

				return new SearchResult(player, {
					query: context.query,
					extractor: parsed.extractor,
					tracks: [parsed],
					requestedBy: context.requestedBy,
					playlist: null,
					queryType: context.queryType,
				});
			}

			const key = this.#createKey(context.query);

			const serialized = await this.redis.get(key);
			if (!serialized) throw new Error('No data found');

			const raw = JSON.parse(serialized) as
				| SerializedTrack[]
				| SerializedPlaylist;

			const parsed = Array.isArray(raw)
				? (raw.map((item) => deserialize(player, item)) as Track[])
				: (deserialize(player, raw) as Playlist);

			return new SearchResult(player, {
				query: context.query,
				extractor: Array.isArray(parsed)
					? parsed[0]?.extractor
					: parsed?.tracks[0]?.extractor,
				tracks: Array.isArray(parsed) ? parsed : parsed.tracks,
				requestedBy: context.requestedBy,
				playlist: Array.isArray(parsed) ? null : parsed,
				queryType: context.queryType,
			});
		} catch {
			return new SearchResult(player, {
				query: context.query,
				extractor: null,
				tracks: [],
				requestedBy: context.requestedBy,
				playlist: null,
				queryType: context.queryType,
			});
		}
	}
}
