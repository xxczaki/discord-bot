import type { ChainableCommander, ScanStream } from 'ioredis';
import { ulid } from 'ulid';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import redis from '../redis';
import { StatsHandler } from '../StatsHandler';

const TEST_ULID = ulid();
const TEST_GUILD_ID = 'guild-123';

vi.mock('../redis', () => ({
	default: {
		set: vi.fn(),
		scanStream: vi.fn(),
		pipeline: vi.fn(),
	},
}));

const mockedRedis = vi.mocked(redis);
const mockedUlid = vi.mocked(ulid);

function createScanStream(batches: string[][]): ScanStream {
	return {
		async *[Symbol.asyncIterator]() {
			for (const batch of batches) {
				yield batch;
			}
		},
	} as unknown as ScanStream;
}

function createMockPipeline() {
	const pipeline = {
		renamenx: vi.fn(),
		exec: vi.fn().mockResolvedValue([]),
	};

	pipeline.renamenx.mockReturnValue(pipeline);

	return pipeline;
}

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
		it('should save play stats to Redis under the guild', async () => {
			const payload = {
				title: 'Test Song',
				author: 'Test Artist',
				requestedById: '123456789',
			};

			await statsHandler.saveStat(TEST_GUILD_ID, 'play', payload);

			expect(mockedRedis.set).toHaveBeenCalledWith(
				`discord-player:stats:${TEST_GUILD_ID}:play:${TEST_ULID}`,
				JSON.stringify(payload),
			);
		});

		it('should save play stats without `requestedById`', async () => {
			const payload = {
				title: 'Test Song',
				author: 'Test Artist',
			};

			await statsHandler.saveStat(TEST_GUILD_ID, 'play', payload);

			expect(mockedRedis.set).toHaveBeenCalledWith(
				`discord-player:stats:${TEST_GUILD_ID}:play:${TEST_ULID}`,
				JSON.stringify(payload),
			);
		});

		it('should save playlist stats under the guild', async () => {
			const payload = { playlistId: 'chill', requestedById: '123' };

			await statsHandler.saveStat(TEST_GUILD_ID, 'playlist', payload);

			expect(mockedRedis.set).toHaveBeenCalledWith(
				`discord-player:stats:${TEST_GUILD_ID}:playlist:${TEST_ULID}`,
				JSON.stringify(payload),
			);
		});
	});

	describe('getStats', () => {
		it('should return a Redis scan stream scoped to the guild', () => {
			const mockStream = createScanStream([]);

			mockedRedis.scanStream.mockReturnValue(mockStream);

			const result = statsHandler.getStats(TEST_GUILD_ID, 'play');

			expect(mockedRedis.scanStream).toHaveBeenCalledWith({
				match: `discord-player:stats:${TEST_GUILD_ID}:play:*`,
				count: 1000,
			});
			expect(result).toBe(mockStream);
		});
	});

	describe('migrateLegacyStats', () => {
		it('should rename legacy keys to guild-scoped keys', async () => {
			const pipeline = createMockPipeline();

			mockedRedis.pipeline.mockReturnValue(
				pipeline as unknown as ChainableCommander,
			);
			mockedRedis.scanStream
				.mockReturnValueOnce(
					createScanStream([
						['discord-player:stats:play:01A', 'discord-player:stats:play:01B'],
					]),
				)
				.mockReturnValueOnce(
					createScanStream([['discord-player:stats:playlist:01C']]),
				);

			const migratedCount =
				await statsHandler.migrateLegacyStats(TEST_GUILD_ID);

			expect(migratedCount).toBe(3);
			expect(mockedRedis.scanStream).toHaveBeenCalledWith({
				match: 'discord-player:stats:play:*',
				count: 1000,
			});
			expect(mockedRedis.scanStream).toHaveBeenCalledWith({
				match: 'discord-player:stats:playlist:*',
				count: 1000,
			});
			expect(pipeline.renamenx).toHaveBeenCalledWith(
				'discord-player:stats:play:01A',
				`discord-player:stats:${TEST_GUILD_ID}:play:01A`,
			);
			expect(pipeline.renamenx).toHaveBeenCalledWith(
				'discord-player:stats:play:01B',
				`discord-player:stats:${TEST_GUILD_ID}:play:01B`,
			);
			expect(pipeline.renamenx).toHaveBeenCalledWith(
				'discord-player:stats:playlist:01C',
				`discord-player:stats:${TEST_GUILD_ID}:playlist:01C`,
			);
			expect(pipeline.exec).toHaveBeenCalledTimes(2);
		});

		it('should skip empty scan batches', async () => {
			mockedRedis.scanStream
				.mockReturnValueOnce(createScanStream([[]]))
				.mockReturnValueOnce(createScanStream([]));

			const migratedCount =
				await statsHandler.migrateLegacyStats(TEST_GUILD_ID);

			expect(migratedCount).toBe(0);
			expect(mockedRedis.pipeline).not.toHaveBeenCalled();
		});
	});
});
