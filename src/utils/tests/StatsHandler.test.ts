import type { ScanStream } from 'ioredis';
import { ulid } from 'ulid';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import redis from '../redis';
import { StatsHandler } from '../StatsHandler';

const TEST_ULID = ulid();

vi.mock('../redis', () => ({
	default: {
		set: vi.fn(),
		scanStream: vi.fn(),
	},
}));

const mockedRedis = vi.mocked(redis);
const mockedUlid = vi.mocked(ulid);

describe('StatsHandler', () => {
	let statsHandler: StatsHandler;

	beforeEach(() => {
		vi.clearAllMocks();
		statsHandler = StatsHandler.getInstance();
		mockedUlid.mockReturnValue(TEST_ULID);
	});

	it('should be a singleton', () => {
		const instance1 = StatsHandler.getInstance();
		const instance2 = StatsHandler.getInstance();
		expect(instance1).toBe(instance2);
	});

	describe('saveStat', () => {
		it('should save play stats to Redis', async () => {
			const payload = {
				title: 'Test Song',
				author: 'Test Artist',
				requestedById: '123456789',
			};

			await statsHandler.saveStat('play', payload);

			expect(mockedRedis.set).toHaveBeenCalledWith(
				`discord-player:stats:play:${TEST_ULID}`,
				JSON.stringify(payload),
			);
		});

		it('should save play stats without `requestedById`', async () => {
			const payload = {
				title: 'Test Song',
				author: 'Test Artist',
			};

			await statsHandler.saveStat('play', payload);

			expect(mockedRedis.set).toHaveBeenCalledWith(
				`discord-player:stats:play:${TEST_ULID}`,
				JSON.stringify(payload),
			);
		});
	});

	describe('getStats', () => {
		it('should return a Redis scan stream for play stats', () => {
			const mockStream = {
				opt: {},
				_redisCursor: 0,
				_redisDrained: false,
				_read: vi.fn(),
			} as unknown as ScanStream;

			mockedRedis.scanStream.mockReturnValue(mockStream);

			const result = statsHandler.getStats('play');

			expect(mockedRedis.scanStream).toHaveBeenCalledWith({
				match: 'discord-player:stats:play:*',
				count: 500,
			});
			expect(result).toBe(mockStream);
		});
	});
});
