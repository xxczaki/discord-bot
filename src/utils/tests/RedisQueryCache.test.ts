import type {
	Player,
	Playlist,
	QueryCacheResolverContext,
	SearchResult,
} from 'discord-player';
import {
	DiscordPlayerQueryResultCache,
	deserialize,
	SearchResult as MockedSearchResult,
	QueryType,
	serialize,
	useMainPlayer,
} from 'discord-player';
import type { Redis } from 'ioredis';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RedisQueryCache } from '../RedisQueryCache';

const EXAMPLE_QUERY = 'test song';
const EXAMPLE_SPOTIFY_PLAYLIST = 'https://open.spotify.com/playlist/123';
const EXAMPLE_CACHE_KEY = 'discord-player:query-cache:test song';

const mockedExternalPlaylistCache = vi.hoisted(() => ({
	setTrackCount: vi.fn(),
}));

const mockedIsUrlSpotifyPlaylist = vi.hoisted(() => vi.fn());

vi.mock('discord-player', () => ({
	serialize: vi.fn(),
	deserialize: vi.fn(),
	useMainPlayer: vi.fn(),
	DiscordPlayerQueryResultCache: vi.fn(function (
		this: Record<string, unknown>,
		item: unknown,
	) {
		Object.assign(this, item as Record<string, unknown>);
	}),
	SearchResult: vi.fn(),
	QueryType: {
		AUTO: 'auto',
	},
}));

vi.mock('../ExternalPlaylistCache', () => ({
	ExternalPlaylistCache: vi.fn(function () {
		return mockedExternalPlaylistCache;
	}),
}));

vi.mock('../isUrlSpotifyPlaylist', () => ({
	default: mockedIsUrlSpotifyPlaylist,
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
		vi.mocked(mockedIsUrlSpotifyPlaylist).mockReturnValue(false);
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
			vi.mocked(mockedIsUrlSpotifyPlaylist).mockReturnValue(false);

			await redisQueryCache.addData(mockSearchResult);

			expect(vi.mocked(serialize)).toHaveBeenCalledWith({ title: 'Test Song' });
			expect(mockRedis.setex).toHaveBeenCalledWith(
				EXAMPLE_CACHE_KEY,
				RedisQueryCache.EXPIRY_TIMEOUT_SECONDS,
				JSON.stringify([{ title: 'Test Song' }]),
			);
			expect(mockedExternalPlaylistCache.setTrackCount).not.toHaveBeenCalled();
		});

		it('should cache playlist data and external playlist track count for Spotify playlists', async () => {
			const mockPlaylist = {
				tracks: [{ title: 'Track 1' }, { title: 'Track 2' }],
				title: 'Test Playlist',
			} as unknown as Playlist;

			const mockSearchResult = {
				query: EXAMPLE_SPOTIFY_PLAYLIST,
				playlist: mockPlaylist,
				tracks: [],
			} as unknown as SearchResult;

			vi.mocked(serialize).mockReturnValue({ title: 'Serialized Playlist' });
			vi.mocked(mockedIsUrlSpotifyPlaylist).mockReturnValue(true);

			await redisQueryCache.addData(mockSearchResult);

			expect(vi.mocked(serialize)).toHaveBeenCalledWith(mockPlaylist);
			expect(mockRedis.setex).toHaveBeenCalledWith(
				'discord-player:query-cache:https://open.spotify.com/playlist/123',
				RedisQueryCache.EXPIRY_TIMEOUT_SECONDS,
				JSON.stringify({ title: 'Serialized Playlist' }),
			);
			expect(mockedExternalPlaylistCache.setTrackCount).toHaveBeenCalledWith(
				EXAMPLE_SPOTIFY_PLAYLIST,
				2,
			);
		});

		it('should not cache external playlist track count when no playlist is provided', async () => {
			const mockSearchResult = {
				query: EXAMPLE_SPOTIFY_PLAYLIST,
				tracks: [{ title: 'Track 1' }, { title: 'Track 2' }],
				playlist: null,
			} as unknown as SearchResult;

			vi.mocked(serialize).mockReturnValue({ title: 'Track' });
			vi.mocked(mockedIsUrlSpotifyPlaylist).mockReturnValue(true);

			await redisQueryCache.addData(mockSearchResult);

			expect(mockRedis.setex).toHaveBeenCalledWith(
				'discord-player:query-cache:https://open.spotify.com/playlist/123',
				RedisQueryCache.EXPIRY_TIMEOUT_SECONDS,
				JSON.stringify([{ title: 'Track' }, { title: 'Track' }]),
			);
			expect(mockedExternalPlaylistCache.setTrackCount).not.toHaveBeenCalled();
		});

		it('should not cache when both tracks and playlist are empty/null', async () => {
			const mockSearchResult = {
				query: EXAMPLE_QUERY,
				tracks: [],
				playlist: null,
			} as unknown as SearchResult;

			await redisQueryCache.addData(mockSearchResult);

			expect(vi.mocked(serialize)).not.toHaveBeenCalled();
			expect(mockRedis.setex).not.toHaveBeenCalled();
			expect(mockedExternalPlaylistCache.setTrackCount).not.toHaveBeenCalled();
		});

		it.each([
			['empty array', []],
			['null', null],
			['undefined', undefined],
		])(
			'should not cache when `tracks` is %s',
			async (_description, tracksValue) => {
				const mockSearchResult = {
					query: EXAMPLE_QUERY,
					tracks: tracksValue,
				} as unknown as SearchResult;

				await redisQueryCache.addData(mockSearchResult);

				expect(vi.mocked(serialize)).not.toHaveBeenCalled();
				expect(mockRedis.setex).not.toHaveBeenCalled();
				expect(
					mockedExternalPlaylistCache.setTrackCount,
				).not.toHaveBeenCalled();
			},
		);
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
			vi.mocked(DiscordPlayerQueryResultCache).mockImplementation(function () {
				return mockCacheItem as never;
			});

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
			vi.mocked(DiscordPlayerQueryResultCache).mockImplementation(function () {
				return mockCacheItem as never;
			});

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

		it('should resolve cached playlist data', async () => {
			const mockPlaylist = {
				title: 'Test Playlist',
				tracks: [{ title: 'Track 1', extractor: 'spotify' }],
			};
			const serializedPlaylist = { title: 'Test Playlist', tracks: [] };

			vi.mocked(mockRedis.get).mockResolvedValue(
				JSON.stringify(serializedPlaylist),
			);
			vi.mocked(deserialize).mockReturnValue(mockPlaylist as never);

			await redisQueryCache.resolve(mockContext);

			expect(mockRedis.get).toHaveBeenCalledWith(EXAMPLE_CACHE_KEY);
			expect(vi.mocked(deserialize)).toHaveBeenCalledWith(
				mockPlayer,
				serializedPlaylist,
			);
			expect(vi.mocked(MockedSearchResult)).toHaveBeenCalledWith(mockPlayer, {
				query: EXAMPLE_QUERY,
				extractor: 'spotify',
				tracks: [{ title: 'Track 1', extractor: 'spotify' }],
				requestedBy: undefined,
				playlist: mockPlaylist,
				queryType: QueryType.AUTO,
			});
		});

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
