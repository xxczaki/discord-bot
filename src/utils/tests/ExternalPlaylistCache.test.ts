import type { Redis } from 'ioredis';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExternalPlaylistCache } from '../ExternalPlaylistCache';

const EXAMPLE_PLAYLIST_URL = 'https://open.spotify.com/playlist/123';
const EXAMPLE_CACHE_KEY =
	'external-playlist-cache:https://open.spotify.com/playlist/123';

describe('ExternalPlaylistCache', () => {
	let externalPlaylistCache: ExternalPlaylistCache;
	let mockRedis: Redis;

	beforeEach(() => {
		vi.clearAllMocks();

		mockRedis = {
			set: vi.fn(),
			get: vi.fn(),
		} as unknown as Redis;

		externalPlaylistCache = new ExternalPlaylistCache(mockRedis);

		vi.useFakeTimers();
		vi.setSystemTime(new Date('2025-06-01T12:00:00.000Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('setTrackCount', () => {
		it('should store track count with timestamp', async () => {
			await externalPlaylistCache.setTrackCount(EXAMPLE_PLAYLIST_URL, 42);

			expect(mockRedis.set).toHaveBeenCalledWith(
				EXAMPLE_CACHE_KEY,
				JSON.stringify({
					trackCount: 42,
					cachedAt: '2025-06-01T12:00:00.000Z',
				}),
			);
		});
	});

	describe('getTrackCount', () => {
		it('should return cached track count and timestamp', async () => {
			const metadata = {
				trackCount: 42,
				cachedAt: '2025-06-01T12:00:00.000Z',
			};

			vi.mocked(mockRedis.get).mockResolvedValue(JSON.stringify(metadata));

			const result =
				await externalPlaylistCache.getTrackCount(EXAMPLE_PLAYLIST_URL);

			expect(mockRedis.get).toHaveBeenCalledWith(EXAMPLE_CACHE_KEY);
			expect(result).toEqual(metadata);
		});

		it('should return null when no cached data exists', async () => {
			vi.mocked(mockRedis.get).mockResolvedValue(null);

			const result =
				await externalPlaylistCache.getTrackCount(EXAMPLE_PLAYLIST_URL);

			expect(result).toBeNull();
		});

		it('should return null when JSON parsing fails', async () => {
			vi.mocked(mockRedis.get).mockResolvedValue('invalid-json');

			const result =
				await externalPlaylistCache.getTrackCount(EXAMPLE_PLAYLIST_URL);

			expect(result).toBeNull();
		});

		it('should return null when Redis throws an error', async () => {
			vi.mocked(mockRedis.get).mockRejectedValue(new Error('Redis error'));

			const result =
				await externalPlaylistCache.getTrackCount(EXAMPLE_PLAYLIST_URL);

			expect(result).toBeNull();
		});
	});

	describe('formatCacheDate', () => {
		it('should format ISO date to human-readable format', () => {
			const result = externalPlaylistCache.formatCacheDate(
				'2025-06-01T12:00:00.000Z',
			);

			expect(result).toBe('Jun 1, 2025');
		});

		it('should format different dates correctly', () => {
			const result1 = externalPlaylistCache.formatCacheDate(
				'2024-12-25T00:00:00.000Z',
			);
			const result2 = externalPlaylistCache.formatCacheDate(
				'2025-01-01T12:00:00.000Z',
			);

			expect(result1).toBe('Dec 25, 2024');
			expect(result2).toBe('Jan 1, 2025');
		});
	});
});
