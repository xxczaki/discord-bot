import { EventEmitter } from 'node:events';
import { captureException } from '@sentry/node';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { ScanStream } from 'ioredis';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import logger from '../../utils/logger';
import redis from '../../utils/redis';
import flushQueryCacheCommandHandler from '../flushQueryCache';

const OWNER_USER_ID = 'mock-owner-id';
const DIFFERENT_USER_ID = 'user456';
const EXAMPLE_CACHE_KEYS = [
	'discord-player:query-cache:track1',
	'discord-player:query-cache:track2',
	'discord-player:query-cache:track3',
];

vi.mock('../../utils/getEnvironmentVariable', () => ({
	default: vi.fn((key: string) => {
		if (key === 'OWNER_USER_ID') {
			return 'mock-owner-id';
		}

		throw new TypeError(`Environment variable ${key} is not defined`);
	}),
}));

const mockedCaptureException = vi.mocked(captureException);
const mockedRedis = vi.mocked(redis);
const mockedLogger = vi.mocked(logger);

interface MockStream extends EventEmitter {
	pause: () => void;
	resume: () => void;
}

function createMockInteraction(userId: string): ChatInputCommandInteraction {
	return {
		member: {
			user: {
				id: userId,
			},
		},
		reply: vi.fn().mockResolvedValue({}),
		editReply: vi.fn().mockResolvedValue({}),
	} as unknown as ChatInputCommandInteraction;
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
});

afterEach(() => {
	vi.restoreAllMocks();
});

it('should reject non-owner users with ephemeral message', async () => {
	const interaction = createMockInteraction(DIFFERENT_USER_ID);

	await flushQueryCacheCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith({
		content: `Only <@!${OWNER_USER_ID}> is allowed to run this command.`,
		flags: ['Ephemeral'],
	});
});

it('should allow owner to flush cache and display success message', async () => {
	const interaction = createMockInteraction(OWNER_USER_ID);
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
	expect(mockedRedis.del).toHaveBeenCalledTimes(3);
	expect(mockedRedis.del).toHaveBeenCalledWith(EXAMPLE_CACHE_KEYS[0]);
	expect(mockedRedis.del).toHaveBeenCalledWith(EXAMPLE_CACHE_KEYS[1]);
	expect(mockedRedis.del).toHaveBeenCalledWith(EXAMPLE_CACHE_KEYS[2]);
	expect(interaction.editReply).toHaveBeenCalledWith(
		'✅ Flushed a total of 3 keys from the query cache.',
	);
});

it('should handle single `key` in success message when only one key is deleted', async () => {
	const interaction = createMockInteraction(OWNER_USER_ID);
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
	const interaction = createMockInteraction(OWNER_USER_ID);
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

	expect(mockedRedis.del).not.toHaveBeenCalled();
	expect(interaction.editReply).toHaveBeenCalledWith(
		'✅ Flushed a total of 0 keys from the query cache.',
	);
});

it('should pause and resume stream during key deletion', async () => {
	const interaction = createMockInteraction(OWNER_USER_ID);
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
	const interaction = createMockInteraction(OWNER_USER_ID);
	const mockStream = createMockStream();
	const deleteError = new Error('Redis connection failed');

	mockedRedis.scanStream.mockReturnValue(mockStream as unknown as ScanStream);
	mockedRedis.del.mockRejectedValueOnce(deleteError);

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
		'✅ Flushed a total of 2 keys from the query cache.',
	);
});

it('should handle multiple data chunks from stream', async () => {
	const interaction = createMockInteraction(OWNER_USER_ID);
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

	expect(mockedRedis.del).toHaveBeenCalledTimes(3);
	expect(interaction.editReply).toHaveBeenCalledWith(
		'✅ Flushed a total of 3 keys from the query cache.',
	);
});

it('should handle undefined keys array in data event', async () => {
	const interaction = createMockInteraction(OWNER_USER_ID);
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

	expect(mockedRedis.del).not.toHaveBeenCalled();
	expect(interaction.editReply).toHaveBeenCalledWith(
		'✅ Flushed a total of 0 keys from the query cache.',
	);
});
