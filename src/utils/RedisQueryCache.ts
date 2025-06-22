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

export class RedisQueryCache implements QueryCacheProvider<Track> {
	static EXPIRY_TIMEOUT_SECONDS = 60 * 60 * 24; // 1 day

	#externalPlaylistCache: ExternalPlaylistCache;

	constructor(public redis: Redis) {
		this.#externalPlaylistCache = new ExternalPlaylistCache(redis);
	}

	#createKey(id: string) {
		return `discord-player:query-cache:${id}` as const;
	}

	async addData(data: SearchResult): Promise<void> {
		// Don't cache empty results to prevent caching failed playlist resolutions
		if ((!data.tracks || data.tracks.length === 0) && !data.playlist) {
			return;
		}

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

	async getData(): Promise<DiscordPlayerQueryResultCache<Track<unknown>>[]> {
		const player = useMainPlayer();

		const data = await this.redis.keys(this.#createKey('*'));

		const serialized = await this.redis.mget(data);

		const parsed = serialized
			.filter(Boolean)
			.map((item) => {
				if (!item) return null;

				return deserialize(player, JSON.parse(item));
			})
			.filter(Boolean) as Track[];

		const res = parsed.map(
			(item) => new DiscordPlayerQueryResultCache(item, 0),
		);

		return res;
	}

	async resolve(context: QueryCacheResolverContext): Promise<SearchResult> {
		const player = useMainPlayer();

		try {
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
