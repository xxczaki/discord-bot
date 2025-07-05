import { EventEmitter } from 'node:events';
import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { Client } from 'discord.js';
import {
	onBeforeCreateStream,
	onStreamExtracted,
	Player,
} from 'discord-player';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import getInitializedPlayer from '../initializePlayer';
import { RedisQueryCache } from '../RedisQueryCache';

vi.mock('discord.js', () => ({
	Client: vi.fn(() => ({ intents: [] })),
}));

vi.mock('discord-player', () => ({
	Player: vi.fn(() => ({
		extractors: {
			register: vi.fn().mockResolvedValue(undefined),
			loadMulti: vi.fn().mockResolvedValue(undefined),
		},
	})),
	onBeforeCreateStream: vi.fn(),
	onStreamExtracted: vi.fn(),
	InterceptedStream: vi.fn(() => ({
		interceptors: {
			add: vi.fn(),
		},
	})),
	AudioFilters: {
		defineBulk: vi.fn(),
	},
}));

vi.mock('discord-player-youtubei', () => ({
	YoutubeiExtractor: vi.fn(),
}));

vi.mock('discord-player-spotify', () => ({
	SpotifyExtractor: vi.fn(),
}));

const mockReadStream = new EventEmitter();
const mockWriteStream = new EventEmitter();

vi.mock('node:fs', () => ({
	createReadStream: vi.fn(() => mockReadStream),
	createWriteStream: vi.fn(() => mockWriteStream),
	existsSync: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
	stat: vi.fn(),
}));

vi.mock('./RedisQueryCache', () => ({
	RedisQueryCache: vi.fn(),
}));

vi.mock('./defineCustomFilters', () => ({
	default: vi.fn(),
}));

const mockGetOpusCacheTrackPath = vi.fn(() => '/cache/path');

vi.mock('./getOpusCacheTrackPath', () => ({
	default: mockGetOpusCacheTrackPath,
}));

vi.mock('./deleteOpusCacheEntry', () => ({
	default: vi.fn(),
}));

let mockClient: Client;
let onBeforeCreateStreamCallback: (...args: unknown[]) => Promise<unknown>;
let onStreamExtractedCallback: (...args: unknown[]) => Promise<unknown>;

beforeEach(() => {
	vi.clearAllMocks();
	mockClient = new Client({ intents: [] });
	mockGetOpusCacheTrackPath.mockReturnValue('/cache/path');

	vi.mocked(onBeforeCreateStream).mockImplementation((callback) => {
		onBeforeCreateStreamCallback = callback as (
			...args: unknown[]
		) => Promise<unknown>;
	});

	vi.mocked(onStreamExtracted).mockImplementation((callback) => {
		onStreamExtractedCallback = callback as (
			...args: unknown[]
		) => Promise<unknown>;
	});
});

it('should create a new player instance with Redis query cache', async () => {
	const player = await getInitializedPlayer(mockClient);

	expect(Player).toHaveBeenCalledWith(mockClient, {
		queryCache: expect.any(RedisQueryCache),
	});
	expect(player).toBeDefined();
	expect(onBeforeCreateStream).toHaveBeenCalledWith(expect.any(Function));
	expect(onStreamExtracted).toHaveBeenCalledWith(expect.any(Function));
});

it('should return existing player instance if already initialized', async () => {
	const player1 = await getInitializedPlayer(mockClient);
	vi.clearAllMocks();
	const player2 = await getInitializedPlayer(mockClient);

	expect(Player).not.toHaveBeenCalled();
	expect(player1).toBe(player2);
});

describe('onBeforeCreateStream hook', () => {
	beforeEach(async () => {
		await getInitializedPlayer(mockClient);
	});

	it('should return null if file write is in progress', async () => {
		const track = { url: 'test-url' };

		// Simulate active write by calling the hook twice
		const firstCall = onBeforeCreateStreamCallback(track);
		const secondCall = onBeforeCreateStreamCallback(track);

		await expect(firstCall).resolves.toBe(null);
		await expect(secondCall).resolves.toBe(null);
	});

	it('should return null if file is too new', async () => {
		const track = { url: 'test-url' };

		vi.mocked(stat).mockResolvedValue({
			size: 2048,
			mtime: new Date(Date.now() - 1000), // 1 second ago
		} as unknown as Awaited<ReturnType<typeof stat>>);

		const result = await onBeforeCreateStreamCallback(track);
		expect(result).toBe(null);
	});

	it('should delete and return null if file is too small', async () => {
		const track = { url: 'test-url' };

		vi.mocked(stat).mockResolvedValue({
			size: 512, // Less than 1KB
			mtime: new Date(Date.now() - 10000), // 10 seconds ago
		} as unknown as Awaited<ReturnType<typeof stat>>);

		const result = await onBeforeCreateStreamCallback(track);
		expect(result).toBe(null);
	});

	it('should return read stream for valid cached file', async () => {
		const track = {
			url: 'test-url',
			metadata: { existing: 'data' },
			setMetadata: vi.fn(),
		};

		vi.mocked(stat).mockResolvedValue({
			size: 2048,
			mtime: new Date(Date.now() - 10000), // 10 seconds ago
		} as unknown as Awaited<ReturnType<typeof stat>>);

		const result = await onBeforeCreateStreamCallback(track);

		expect(result).toBe(mockReadStream);
		expect(track.setMetadata).toHaveBeenCalledWith({
			existing: 'data',
			isFromCache: true,
		});
		expect(createReadStream).toHaveBeenCalledTimes(1);
	});

	it('should return null if file stat fails', async () => {
		const track = { url: 'test-url' };

		vi.mocked(stat).mockRejectedValue(new Error('File not found'));

		const result = await onBeforeCreateStreamCallback(track);
		expect(result).toBe(null);
	});
});

describe('onStreamExtracted hook', () => {
	beforeEach(async () => {
		await getInitializedPlayer(mockClient);
	});

	it('should return string stream unchanged', async () => {
		const stringStream = 'http://example.com/stream';
		const track = { url: 'test-url' };

		const result = await onStreamExtractedCallback(stringStream, track);
		expect(result).toBe(stringStream);
	});

	it('should handle Readable stream', async () => {
		const readable = new Readable();
		readable.pipe = vi.fn().mockReturnValue('piped-stream');

		const track = { url: 'test-url' };

		const result = await onStreamExtractedCallback(readable, track);

		expect(result).toBe('piped-stream');
		expect(createWriteStream).toHaveBeenCalledTimes(1);
	});

	it('should handle non-Readable stream object', async () => {
		const readable = new Readable();
		readable.pipe = vi.fn().mockReturnValue('piped-stream');

		const stream = {
			stream: readable,
			$fmt: 'opus',
		};

		const track = { url: 'test-url' };

		const result = await onStreamExtractedCallback(stream, track);

		expect(result).toEqual({
			stream: 'piped-stream',
			$fmt: 'opus',
		});
	});

	it('should handle write stream errors', async () => {
		const readable = new Readable();
		readable.pipe = vi.fn().mockReturnValue('piped-stream');

		const track = { url: 'test-url' };

		await onStreamExtractedCallback(readable, track);

		mockWriteStream.emit('error', new Error('Write failed'));
	});

	it('should handle readable stream errors', async () => {
		const readable = new Readable();
		readable.pipe = vi.fn().mockReturnValue('piped-stream');

		const track = { url: 'test-url' };

		await onStreamExtractedCallback(readable, track);

		readable.emit('error', new Error('Read failed'));
	});

	it('should handle stream creation errors', async () => {
		const readable = new Readable();

		vi.mocked(createWriteStream).mockImplementation(() => {
			throw new Error('Failed to create write stream');
		});

		const track = { url: 'test-url' };

		const result = await onStreamExtractedCallback(readable, track);

		expect(result).toBe(readable);
	});
});
