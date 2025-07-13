import { EventEmitter } from 'node:events';
import { captureException } from '@sentry/node';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { ScanStream } from 'ioredis';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import logger from '../../utils/logger';
import redis from '../../utils/redis';
import flushQueryCacheCommandHandler from '../flushQueryCache';

vi.mock('../../utils/getEnvironmentVariable', () => ({
	default: vi.fn((key: string) => {
		if (key === 'REDIS_URL') {
			return 'redis://localhost:6379';
		}
		if (key === 'OWNER_USER_ID') {
			return 'mock-owner-id';
		}
		throw new TypeError(`Environment variable ${key} is not defined`);
	}),
}));

const EXAMPLE_CACHE_KEYS = [
	'discord-player:query-cache:track1',
	'discord-player:query-cache:track2',
	'discord-player:query-cache:track3',
];

const mockedRedis = vi.mocked(redis);
const mockedLogger = vi.mocked(logger);
const mockedCaptureException = vi.mocked(captureException);

function createMockInteraction(): ChatInputCommandInteraction {
	return {
		reply: vi.fn().mockResolvedValue({}),
		editReply: vi.fn().mockResolvedValue({}),
	} as unknown as ChatInputCommandInteraction;
}

interface MockStream extends EventEmitter {
	pause: () => void;
	resume: () => void;
}

function createMockStream(): MockStream {
	const stream = new EventEmitter() as MockStream;
	stream.pause = vi.fn();
	stream.resume = vi.fn();

	return stream;
}

beforeEach(() => {
	vi.clearAllMocks();
	mockedRedis.del.mockResolvedValue(1);

	const mockPipeline = {
		del: vi.fn().mockReturnThis(),
		exec: vi.fn().mockResolvedValue([]),
	} as unknown as ReturnType<typeof redis.pipeline>;
	mockedRedis.pipeline.mockReturnValue(mockPipeline);
});

afterEach(() => {
	vi.restoreAllMocks();
});

it('should allow flushing cache and display success message', async () => {
	const interaction = createMockInteraction();
	const mockStream = createMockStream();
	mockedRedis.scanStream.mockReturnValue(mockStream as unknown as ScanStream);

	const promise = flushQueryCacheCommandHandler(interaction);

	setTimeout(() => {
		mockStream.emit('data', EXAMPLE_CACHE_KEYS);
	}, 10);

	setTimeout(() => {
		mockStream.emit('end');
	}, 20);

	await promise;

	expect(interaction.reply).toHaveBeenCalledWith('Flushing the query cache…');
	expect(mockedRedis.scanStream).toHaveBeenCalledWith({
		match: 'discord-player:query-cache:*',
		count: 500,
	});
	expect(mockedRedis.pipeline).toHaveBeenCalledTimes(1);
	const mockPipeline = mockedRedis.pipeline();
	expect(mockPipeline.del).toHaveBeenCalledTimes(3);
	expect(mockPipeline.del).toHaveBeenCalledWith(EXAMPLE_CACHE_KEYS[0]);
	expect(mockPipeline.del).toHaveBeenCalledWith(EXAMPLE_CACHE_KEYS[1]);
	expect(mockPipeline.del).toHaveBeenCalledWith(EXAMPLE_CACHE_KEYS[2]);
	expect(interaction.editReply).toHaveBeenCalledWith(
		'✅ Flushed a total of 3 keys from the query cache.',
	);
});

it('should handle single `key` in success message when only one key is deleted', async () => {
	const interaction = createMockInteraction();
	const mockStream = createMockStream();
	mockedRedis.scanStream.mockReturnValue(mockStream as unknown as ScanStream);

	const promise = flushQueryCacheCommandHandler(interaction);

	setTimeout(() => {
		mockStream.emit('data', [EXAMPLE_CACHE_KEYS[0]]);
	}, 10);

	setTimeout(() => {
		mockStream.emit('end');
	}, 20);

	await promise;

	expect(interaction.editReply).toHaveBeenCalledWith(
		'✅ Flushed a total of 1 key from the query cache.',
	);
});

it('should handle empty cache gracefully', async () => {
	const interaction = createMockInteraction();
	const mockStream = createMockStream();
	mockedRedis.scanStream.mockReturnValue(mockStream as unknown as ScanStream);

	const promise = flushQueryCacheCommandHandler(interaction);

	setTimeout(() => {
		mockStream.emit('data', []);
	}, 10);

	setTimeout(() => {
		mockStream.emit('end');
	}, 20);

	await promise;

	expect(mockedRedis.pipeline).not.toHaveBeenCalled();
	expect(interaction.editReply).toHaveBeenCalledWith(
		'✅ Flushed a total of 0 keys from the query cache.',
	);
});

it('should pause and resume stream during key deletion', async () => {
	const interaction = createMockInteraction();
	const mockStream = createMockStream();
	mockedRedis.scanStream.mockReturnValue(mockStream as unknown as ScanStream);

	const promise = flushQueryCacheCommandHandler(interaction);

	setTimeout(() => {
		mockStream.emit('data', EXAMPLE_CACHE_KEYS);

		expect(mockStream.pause).toHaveBeenCalled();
	}, 10);

	setTimeout(() => {
		mockStream.emit('end');

		expect(mockStream.resume).toHaveBeenCalled();
	}, 20);

	await promise;
});

it('should handle redis deletion errors gracefully', async () => {
	const interaction = createMockInteraction();
	const mockStream = createMockStream();
	const deleteError = new Error('Redis connection failed');

	mockedRedis.scanStream.mockReturnValue(mockStream as unknown as ScanStream);
	const mockPipeline = {
		del: vi.fn().mockReturnThis(),
		exec: vi.fn().mockRejectedValueOnce(deleteError),
	} as unknown as ReturnType<typeof redis.pipeline>;
	mockedRedis.pipeline.mockReturnValue(mockPipeline);

	const promise = flushQueryCacheCommandHandler(interaction);

	setTimeout(() => {
		mockStream.emit('data', EXAMPLE_CACHE_KEYS);
	}, 10);

	setTimeout(() => {
		mockStream.emit('end');
	}, 20);

	await promise;

	expect(mockedLogger.error).toHaveBeenCalledWith(deleteError);
	expect(mockedCaptureException).toHaveBeenCalledWith(deleteError);

	expect(interaction.editReply).toHaveBeenCalledWith(
		'✅ Flushed a total of 0 keys from the query cache.',
	);
});

it('should handle multiple data chunks from stream', async () => {
	const interaction = createMockInteraction();
	const mockStream = createMockStream();
	mockedRedis.scanStream.mockReturnValue(mockStream as unknown as ScanStream);

	const promise = flushQueryCacheCommandHandler(interaction);

	setTimeout(() => {
		mockStream.emit('data', EXAMPLE_CACHE_KEYS.slice(0, 2));
	}, 10);

	setTimeout(() => {
		mockStream.emit('data', EXAMPLE_CACHE_KEYS.slice(2));
	}, 15);

	setTimeout(() => {
		mockStream.emit('end');
	}, 20);

	await promise;

	expect(mockedRedis.pipeline).toHaveBeenCalledTimes(2);
	const mockPipeline = mockedRedis.pipeline();
	expect(mockPipeline.del).toHaveBeenCalledTimes(3);
	expect(interaction.editReply).toHaveBeenCalledWith(
		'✅ Flushed a total of 3 keys from the query cache.',
	);
});

it('should handle undefined keys array in data event', async () => {
	const interaction = createMockInteraction();
	const mockStream = createMockStream();
	mockedRedis.scanStream.mockReturnValue(mockStream as unknown as ScanStream);

	const promise = flushQueryCacheCommandHandler(interaction);

	setTimeout(() => {
		mockStream.emit('data', undefined);
	}, 10);

	setTimeout(() => {
		mockStream.emit('end');
	}, 20);

	await promise;

	expect(mockedRedis.pipeline).not.toHaveBeenCalled();
	expect(interaction.editReply).toHaveBeenCalledWith(
		'✅ Flushed a total of 0 keys from the query cache.',
	);
});
