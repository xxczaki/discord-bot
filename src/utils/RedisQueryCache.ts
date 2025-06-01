import {
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
	static EXPIRY_TIMEOUT_MS = 1000 * 60 * 60 * 24 * 365; // 1 year

	constructor(public redis: Redis) {}

	#createKey(id: string) {
		return `discord-player:query-cache:${id}` as const;
	}

	async addData(data: SearchResult): Promise<void> {
		// Don't cache empty results to prevent caching failed playlist resolutions
		if (!data.tracks || data.tracks.length === 0) {
			return;
		}

		const key = this.#createKey(data.query);
		const serialized = JSON.stringify(
			data.tracks.map((track) => serialize(track)),
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

			const raw = JSON.parse(serialized) as SerializedTrack[];
			const parsed = raw.map((item) => deserialize(player, item)) as Track[];

			return new SearchResult(player, {
				query: context.query,
				extractor: parsed[0]?.extractor,
				tracks: parsed,
				requestedBy: context.requestedBy,
				playlist: null,
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
