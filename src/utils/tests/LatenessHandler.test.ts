import type { ChainableCommander, ScanStream } from 'ioredis';
import { ulid } from 'ulid';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LatenessHandler } from '../LatenessHandler';
import redis from '../redis';

const TEST_ULID = ulid();
const EXPECTED_DATE = new Date('2025-05-24T10:00:00Z');
const ACTUAL_DATE = new Date('2025-05-24T10:05:00Z');
const OLD_ACTUAL_DATE = new Date('2025-05-21T10:00:00Z');

vi.mock('../redis', () => ({
	default: {
		exists: vi.fn(),
		set: vi.fn(),
		get: vi.fn(),
		del: vi.fn(),
		multi: vi.fn(),
		scanStream: vi.fn(),
	},
}));

const mockedRedis = vi.mocked(redis);
const mockedUlid = vi.mocked(ulid);

describe('LatenessHandler', () => {
	let latenessHandler: LatenessHandler;

	beforeEach(() => {
		vi.clearAllMocks();
		latenessHandler = LatenessHandler.getInstance();
		mockedUlid.mockReturnValue(TEST_ULID);
	});

	it('should be a singleton', () => {
		const instance1 = LatenessHandler.getInstance();
		const instance2 = LatenessHandler.getInstance();
		expect(instance1).toBe(instance2);
	});

	describe('start', () => {
		it('should set lock when not already locked', async () => {
			mockedRedis.exists.mockResolvedValue(0);

			await latenessHandler.start(EXPECTED_DATE);

			expect(mockedRedis.set).toHaveBeenCalledWith(
				'discord-player:lateness-lock',
				EXPECTED_DATE.toString(),
			);
		});

		it('should not set lock when already locked', async () => {
			mockedRedis.exists.mockResolvedValue(1);

			await latenessHandler.start(EXPECTED_DATE);

			expect(mockedRedis.set).not.toHaveBeenCalled();
		});
	});

	describe('end', () => {
		const mockMulti = {
			del: vi.fn().mockReturnThis(),
			set: vi.fn().mockReturnThis(),
			exec: vi.fn(),
		} as Partial<ChainableCommander>;

		beforeEach(() => {
			mockedRedis.multi.mockReturnValue(mockMulti as ChainableCommander);
		});

		it('should not proceed when not locked', async () => {
			mockedRedis.exists.mockResolvedValue(0);

			await latenessHandler.end(ACTUAL_DATE);

			expect(mockedRedis.get).not.toHaveBeenCalled();
		});

		it('should not proceed when lock value is not found', async () => {
			mockedRedis.exists.mockResolvedValue(1);
			mockedRedis.get.mockResolvedValue(null);

			await latenessHandler.end(ACTUAL_DATE);

			expect(mockedRedis.multi).not.toHaveBeenCalled();
		});

		it('should only delete lock when actual date is too old', async () => {
			mockedRedis.exists.mockResolvedValue(1);
			mockedRedis.get.mockResolvedValue(EXPECTED_DATE.toString());

			await latenessHandler.end(OLD_ACTUAL_DATE);

			expect(mockedRedis.del).toHaveBeenCalledWith(
				'discord-player:lateness-lock',
			);
			expect(mockedRedis.multi).not.toHaveBeenCalled();
		});

		it('should save lateness data when actual date is within 2 days', async () => {
			mockedRedis.exists.mockResolvedValue(1);
			mockedRedis.get.mockResolvedValue(EXPECTED_DATE.toString());

			await latenessHandler.end(ACTUAL_DATE);

			expect(mockedRedis.multi).toHaveBeenCalled();
			expect(mockMulti.del).toHaveBeenCalledWith(
				'discord-player:lateness-lock',
			);
			expect(mockMulti.set).toHaveBeenCalledWith(
				`discord-player:lateness:${TEST_ULID}`,
				JSON.stringify({
					expected: EXPECTED_DATE.toString(),
					actual: ACTUAL_DATE.toString(),
				}),
			);
			expect(mockMulti.exec).toHaveBeenCalled();
		});

		it('should save lateness data when actual is null', async () => {
			mockedRedis.exists.mockResolvedValue(1);
			mockedRedis.get.mockResolvedValue(EXPECTED_DATE.toString());

			await latenessHandler.end(null);

			expect(mockedRedis.multi).toHaveBeenCalled();
			expect(mockMulti.del).toHaveBeenCalledWith(
				'discord-player:lateness-lock',
			);
			expect(mockMulti.set).toHaveBeenCalledWith(
				`discord-player:lateness:${TEST_ULID}`,
				JSON.stringify({
					expected: EXPECTED_DATE.toString(),
					actual: null,
				}),
			);
			expect(mockMulti.exec).toHaveBeenCalled();
		});
	});

	describe('`isLocked` getter', () => {
		it('should call Redis exists with correct key', () => {
			latenessHandler.isLocked;

			expect(mockedRedis.exists).toHaveBeenCalledWith(
				'discord-player:lateness-lock',
			);
		});
	});

	describe('`getStats`', () => {
		it('should return Redis scan stream with correct parameters', () => {
			const mockStream = {} as ScanStream;
			mockedRedis.scanStream.mockReturnValue(mockStream);

			const result = latenessHandler.getStats();

			expect(result).toBe(mockStream);
			expect(mockedRedis.scanStream).toHaveBeenCalledWith({
				match: 'discord-player:lateness:*',
				count: 10,
			});
		});
	});
});
