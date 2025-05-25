import type {
	Player,
	QueryCacheResolverContext,
	SearchResult,
} from 'discord-player';
import {
	DiscordPlayerQueryResultCache,
	SearchResult as MockedSearchResult,
	QueryType,
	deserialize,
	serialize,
	useMainPlayer,
} from 'discord-player';
import type { Redis } from 'ioredis';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RedisQueryCache } from '../RedisQueryCache';

const EXAMPLE_QUERY = 'test song';
const EXAMPLE_CACHE_KEY = 'discord-player:query-cache:test song';

vi.mock('discord-player', () => ({
	serialize: vi.fn(),
	deserialize: vi.fn(),
	useMainPlayer: vi.fn(),
	DiscordPlayerQueryResultCache: vi.fn(),
	SearchResult: vi.fn(),
	QueryType: {
		AUTO: 'auto',
	},
}));

describe('RedisQueryCache', () => {
	let redisQueryCache: RedisQueryCache;
	let mockRedis: Redis;
	let mockPlayer: Player;

	beforeEach(() => {
		vi.clearAllMocks();

		mockRedis = {
			setex: vi.fn(),
			keys: vi.fn(),
			mget: vi.fn(),
			get: vi.fn(),
		} as unknown as Redis;

		mockPlayer = { id: 'test-player' } as Player;
		redisQueryCache = new RedisQueryCache(mockRedis);

		vi.mocked(useMainPlayer).mockReturnValue(mockPlayer);
	});

	it('should store redis client', () => {
		expect(redisQueryCache.redis).toBe(mockRedis);
	});

	describe('addData', () => {
		it('should store track data', async () => {
			const mockSearchResult = {
				query: EXAMPLE_QUERY,
				tracks: [{ title: 'Test Song' }],
			} as unknown as SearchResult;

			vi.mocked(serialize).mockReturnValue({ title: 'Test Song' });

			await redisQueryCache.addData(mockSearchResult);

			expect(vi.mocked(serialize)).toHaveBeenCalledWith({ title: 'Test Song' });
			expect(mockRedis.setex).toHaveBeenCalledWith(
				EXAMPLE_CACHE_KEY,
				RedisQueryCache.EXPIRY_TIMEOUT_MS,
				JSON.stringify([{ title: 'Test Song' }]),
			);
		});
	});

	describe('getData', () => {
		it('should return cached tracks', async () => {
			const mockTrack = { title: 'Test Song' };
			const mockCacheItem = {
				data: mockTrack,
				expireAfter: 0,
				hasExpired: false,
			};

			vi.mocked(mockRedis.keys).mockResolvedValue([EXAMPLE_CACHE_KEY]);
			vi.mocked(mockRedis.mget).mockResolvedValue(['{"title":"Test Song"}']);
			vi.mocked(deserialize).mockReturnValue(mockTrack as never);
			vi.mocked(DiscordPlayerQueryResultCache).mockReturnValue(
				mockCacheItem as never,
			);

			const result = await redisQueryCache.getData();

			expect(mockRedis.keys).toHaveBeenCalledWith(
				'discord-player:query-cache:*',
			);
			expect(mockRedis.mget).toHaveBeenCalledWith([EXAMPLE_CACHE_KEY]);
			expect(vi.mocked(deserialize)).toHaveBeenCalledWith(mockPlayer, {
				title: 'Test Song',
			});
			expect(result).toHaveLength(1);
		});

		it('should filter out null values', async () => {
			const mockTrack = { title: 'Test' };
			const mockCacheItem = {
				data: mockTrack,
				expireAfter: 0,
				hasExpired: false,
			};

			vi.mocked(mockRedis.keys).mockResolvedValue(['key1', 'key2']);
			vi.mocked(mockRedis.mget).mockResolvedValue(['{"title":"Test"}', null]);
			vi.mocked(deserialize).mockReturnValue(mockTrack as never);
			vi.mocked(DiscordPlayerQueryResultCache).mockReturnValue(
				mockCacheItem as never,
			);

			const result = await redisQueryCache.getData();

			expect(vi.mocked(deserialize)).toHaveBeenCalledTimes(1);
			expect(result).toHaveLength(1);
		});
	});

	describe('resolve', () => {
		const mockContext: QueryCacheResolverContext = {
			query: EXAMPLE_QUERY,
			requestedBy: undefined,
			queryType: QueryType.AUTO,
		};

		it('should resolve cached track data', async () => {
			const mockTrack = { title: 'Test Song', extractor: 'youtube' };
			const serializedTracks = [{ title: 'Test Song' }];

			vi.mocked(mockRedis.get).mockResolvedValue(
				JSON.stringify(serializedTracks),
			);
			vi.mocked(deserialize).mockReturnValue(mockTrack as never);

			await redisQueryCache.resolve(mockContext);

			expect(mockRedis.get).toHaveBeenCalledWith(EXAMPLE_CACHE_KEY);
			expect(vi.mocked(deserialize)).toHaveBeenCalledWith(mockPlayer, {
				title: 'Test Song',
			});
			expect(vi.mocked(MockedSearchResult)).toHaveBeenCalledWith(mockPlayer, {
				query: EXAMPLE_QUERY,
				extractor: 'youtube',
				tracks: [mockTrack],
				requestedBy: undefined,
				playlist: null,
				queryType: QueryType.AUTO,
			});
		});

		it('should return empty result when no cached data', async () => {
			vi.mocked(mockRedis.get).mockResolvedValue(null);

			await redisQueryCache.resolve(mockContext);

			expect(vi.mocked(MockedSearchResult)).toHaveBeenCalledWith(mockPlayer, {
				query: EXAMPLE_QUERY,
				extractor: null,
				tracks: [],
				requestedBy: undefined,
				playlist: null,
				queryType: QueryType.AUTO,
			});
		});

		it('should handle JSON parse errors', async () => {
			vi.mocked(mockRedis.get).mockResolvedValue('invalid-json');

			await redisQueryCache.resolve(mockContext);

			expect(vi.mocked(MockedSearchResult)).toHaveBeenCalledWith(mockPlayer, {
				query: EXAMPLE_QUERY,
				extractor: null,
				tracks: [],
				requestedBy: undefined,
				playlist: null,
				queryType: QueryType.AUTO,
			});
		});

		it('should handle deserialization errors', async () => {
			vi.mocked(mockRedis.get).mockResolvedValue('["valid-json"]');
			vi.mocked(deserialize).mockImplementation(() => {
				throw new Error('Deserialization failed');
			});

			await redisQueryCache.resolve(mockContext);

			expect(vi.mocked(MockedSearchResult)).toHaveBeenCalledWith(mockPlayer, {
				query: EXAMPLE_QUERY,
				extractor: null,
				tracks: [],
				requestedBy: undefined,
				playlist: null,
				queryType: QueryType.AUTO,
			});
		});
	});
});
