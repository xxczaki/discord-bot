import {
	type Playlist,
	type SerializedPlaylist,
	type SerializedTrack,
	deserialize,
	serialize,
	useMainPlayer,
} from 'discord-player';
import {
	DiscordPlayerQueryResultCache,
	type QueryCacheProvider,
	type QueryCacheResolverContext,
	SearchResult,
	type Track,
} from 'discord-player';
import type { Redis } from 'ioredis';

export class RedisQueryCache implements QueryCacheProvider<Track> {
	static EXPIRY_TIMEOUT_MS = 1000 * 60 * 15; // 15 minutes

	constructor(public redis: Redis) {}

	#createKey(id: string) {
		return `discord-player:query-cache:${id}` as const;
	}

	async addData(data: SearchResult): Promise<void> {
		const key = this.#createKey(data.query);
		const serialized = JSON.stringify(
			data.playlist
				? serialize(data.playlist)
				: data.tracks.map((track) => serialize(track)),
		);

		await this.redis.setex(key, RedisQueryCache.EXPIRY_TIMEOUT_MS, serialized);
	}

	async getData(): Promise<DiscordPlayerQueryResultCache<Track<unknown>>[]> {
		const player = useMainPlayer();

		const data = await this.redis.keys(this.#createKey('*'));

		const serialized = await this.redis.mget(data);

		const parsed = serialized
			.filter(Boolean)
			// biome-ignore lint/style/noNonNullAssertion: Code copied from discord-player
			.map((item) => deserialize(player, JSON.parse(item!))) as Track[];

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
					? parsed[0].extractor
					: parsed?.tracks[0].extractor,
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
