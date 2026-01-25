import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { Client } from 'discord.js';
import {
	InterceptedStream,
	onBeforeCreateStream,
	onStreamExtracted,
	Player,
} from 'discord-player';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import getInitializedPlayer from '../initializePlayer';
import { RedisQueryCache } from '../RedisQueryCache';

vi.mock('../getOpusCacheDirectoryPath', () => ({
	default: vi.fn().mockReturnValue('/mock/cache/path'),
}));

interface MockTrack {
	url: string;
	durationMS?: number;
	metadata?: Record<string, unknown>;
	setMetadata: ReturnType<typeof vi.fn>;
}

interface MockWriteStream {
	on: ReturnType<typeof vi.fn>;
}

interface MockInterceptor {
	interceptors: {
		add: ReturnType<typeof vi.fn>;
	};
}

type TrackCallback = (
	track: MockTrack,
) => Promise<NodeJS.ReadableStream | null>;
type StreamCallback = (
	stream: string | Readable | { stream: Readable; $fmt: string },
	track: MockTrack,
) => Promise<string | Readable | { stream: string; $fmt: string }>;

let onBeforeCreateStreamCallback: TrackCallback | null;
let onStreamExtractedCallback: StreamCallback | null;

vi.mock('discord.js', () => ({
	Client: vi.fn(function () {
		return { intents: [] };
	}),
}));

vi.mock('discord-player', () => ({
	Player: vi.fn(function () {
		return {
			extractors: {
				register: vi.fn().mockResolvedValue(undefined),
				loadMulti: vi.fn().mockResolvedValue(undefined),
			},
		};
	}),
	onBeforeCreateStream: vi.fn((callback: TrackCallback) => {
		onBeforeCreateStreamCallback = callback;
	}),
	onStreamExtracted: vi.fn((callback: StreamCallback) => {
		onStreamExtractedCallback = callback;
	}),
	InterceptedStream: vi.fn(function (this: {
		interceptors: { add: ReturnType<typeof vi.fn> };
	}) {
		this.interceptors = {
			add: vi.fn(),
		};
		return this;
	}),
	AudioFilters: {
		defineBulk: vi.fn(),
	},
}));

vi.mock('discord-player-googlevideo', () => ({
	YoutubeSabrExtractor: vi.fn(),
}));

vi.mock('discord-player-spotify', () => ({
	SpotifyExtractor: vi.fn(),
}));

vi.mock('node:fs', () => ({
	createReadStream: vi.fn(),
	createWriteStream: vi.fn(function () {
		return {
			on: vi.fn(),
		};
	}),
	existsSync: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
	stat: vi.fn(),
}));

vi.mock('./deleteOpusCacheEntry', () => ({
	default: vi.fn(),
}));

vi.mock('./RedisQueryCache', () => ({
	RedisQueryCache: vi.fn(),
}));

vi.mock('./defineCustomFilters', () => ({
	default: vi.fn(),
}));

const mockGetOpusCacheTrackPath = vi.fn();
vi.mock('./getOpusCacheTrackPath', () => ({
	default: mockGetOpusCacheTrackPath,
}));

let mockClient: Client;

beforeEach(() => {
	vi.clearAllMocks();
	mockClient = new Client({ intents: [] });
	mockGetOpusCacheTrackPath.mockReturnValue('/opus-cache/test-track.opus');
});

describe('Player initialization', () => {
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
});

describe('onBeforeCreateStream callback', () => {
	it('should handle cache hit with valid file', async () => {
		const mockStat = vi.mocked(stat);
		const mockCreateReadStream = vi.mocked(createReadStream);
		const mockReadStream = { pipe: vi.fn() };

		mockStat.mockResolvedValue({
			size: 2048,
			mtime: new Date(Date.now() - 10000),
		} as unknown as import('fs').Stats);
		mockCreateReadStream.mockReturnValue(
			mockReadStream as unknown as import('fs').ReadStream,
		);

		await getInitializedPlayer(mockClient);

		expect(onBeforeCreateStreamCallback).toBeDefined();

		const mockTrack: MockTrack = {
			url: 'https://example.com/track',
			metadata: {},
			setMetadata: vi.fn(),
		};

		const result = await onBeforeCreateStreamCallback?.(mockTrack);

		expect(mockStat).toHaveBeenCalledWith(
			'/mock/cache/path/aHR0cHM6Ly9leGFtcGxlLmNvbS90cmFjaw.opus',
		);
		expect(mockTrack.setMetadata).toHaveBeenCalledWith({
			isFromCache: true,
		});
		expect(result).toBe(mockReadStream);
	});

	it('should return null when file is too new', async () => {
		const mockStat = vi.mocked(stat);

		mockStat.mockResolvedValue({
			size: 2048,
			mtime: new Date(Date.now() - 1000),
		} as unknown as import('fs').Stats);

		await getInitializedPlayer(mockClient);

		const mockTrack: MockTrack = {
			url: 'https://example.com/track',
			metadata: {},
			setMetadata: vi.fn(),
		};

		const result = await onBeforeCreateStreamCallback?.(mockTrack);

		expect(result).toBeNull();
		expect(mockTrack.setMetadata).not.toHaveBeenCalled();
	});

	it('should return null and delete when file is too small', async () => {
		const mockStat = vi.mocked(stat);

		mockStat.mockResolvedValue({
			size: 512,
			mtime: new Date(Date.now() - 10000),
		} as unknown as import('fs').Stats);

		await getInitializedPlayer(mockClient);

		const mockTrack: MockTrack = {
			url: 'https://example.com/track',
			metadata: {},
			setMetadata: vi.fn(),
		};

		const result = await onBeforeCreateStreamCallback?.(mockTrack);

		expect(result).toBeNull();
	});

	it('should return null and delete when file is incomplete based on duration', async () => {
		const mockStat = vi.mocked(stat);

		mockStat.mockResolvedValue({
			size: 2_000_000,
			mtime: new Date(Date.now() - 10000),
		} as unknown as import('fs').Stats);

		await getInitializedPlayer(mockClient);

		const mockTrack: MockTrack = {
			url: 'https://example.com/track',
			durationMS: 300_000,
			metadata: {},
			setMetadata: vi.fn(),
		};

		const result = await onBeforeCreateStreamCallback?.(mockTrack);

		expect(result).toBeNull();
		expect(mockTrack.setMetadata).toHaveBeenCalledWith({
			cacheInvalidated: true,
		});
	});

	it('should skip duration check when `durationMS` is 0', async () => {
		const mockStat = vi.mocked(stat);
		const mockCreateReadStream = vi.mocked(createReadStream);
		const mockReadStream = { pipe: vi.fn() };

		mockStat.mockResolvedValue({
			size: 2048,
			mtime: new Date(Date.now() - 10000),
		} as unknown as import('fs').Stats);
		mockCreateReadStream.mockReturnValue(
			mockReadStream as unknown as import('fs').ReadStream,
		);

		await getInitializedPlayer(mockClient);

		const mockTrack: MockTrack = {
			url: 'https://example.com/track',
			durationMS: 0,
			metadata: {},
			setMetadata: vi.fn(),
		};

		const result = await onBeforeCreateStreamCallback?.(mockTrack);

		expect(mockTrack.setMetadata).toHaveBeenCalledWith({
			isFromCache: true,
		});
		expect(result).toBe(mockReadStream);
	});

	it('should return null on file stat error', async () => {
		const mockStat = vi.mocked(stat);
		mockStat.mockRejectedValue(new Error('File not found'));

		await getInitializedPlayer(mockClient);

		const mockTrack: MockTrack = {
			url: 'https://example.com/track',
			metadata: {},
			setMetadata: vi.fn(),
		};

		const result = await onBeforeCreateStreamCallback?.(mockTrack);

		expect(result).toBeNull();
	});

	it('should return null when file path has active write', async () => {
		const activeWritePath = '/opus-cache/active-write.opus';

		mockGetOpusCacheTrackPath.mockReturnValue(activeWritePath);

		await getInitializedPlayer(mockClient);

		const mockTrack: MockTrack = {
			url: 'https://example.com/active-track',
			metadata: {},
			setMetadata: vi.fn(),
		};

		const mockReadable = new Readable();

		mockReadable.pipe = vi.fn();
		mockReadable.on = vi.fn();

		await onStreamExtractedCallback?.(mockReadable, mockTrack);

		const result = await onBeforeCreateStreamCallback?.(mockTrack);

		expect(result).toBeNull();
		expect(mockTrack.setMetadata).not.toHaveBeenCalled();
	});

	it('should preserve existing metadata when adding cache flag', async () => {
		const mockStat = vi.mocked(stat);
		const mockCreateReadStream = vi.mocked(createReadStream);
		const mockReadStream = { pipe: vi.fn() };

		mockStat.mockResolvedValue({
			size: 2048,
			mtime: new Date(Date.now() - 10000),
		} as unknown as import('fs').Stats);
		mockCreateReadStream.mockReturnValue(
			mockReadStream as unknown as import('fs').ReadStream,
		);

		await getInitializedPlayer(mockClient);

		const mockTrack: MockTrack = {
			url: 'https://example.com/track',
			metadata: { existingKey: 'value' },
			setMetadata: vi.fn(),
		};

		await onBeforeCreateStreamCallback?.(mockTrack);

		expect(mockTrack.setMetadata).toHaveBeenCalledWith({
			existingKey: 'value',
			isFromCache: true,
		});
	});
});

describe('onStreamExtracted callback', () => {
	it('should handle string stream passthrough', async () => {
		await getInitializedPlayer(mockClient);

		expect(onStreamExtractedCallback).toBeDefined();

		const mockTrack: MockTrack = {
			url: 'https://example.com/track',
			setMetadata: vi.fn(),
		};
		const result = await onStreamExtractedCallback?.(
			'string-stream',
			mockTrack,
		);

		expect(result).toBe('string-stream');
	});

	it('should handle Readable stream with caching', async () => {
		const mockWriteStream: MockWriteStream = {
			on: vi.fn(),
		};
		const mockInterceptor: MockInterceptor = {
			interceptors: { add: vi.fn() },
		};

		vi.mocked(createWriteStream).mockReturnValue(
			mockWriteStream as unknown as import('fs').WriteStream,
		);
		vi.mocked(
			InterceptedStream as unknown as ReturnType<typeof vi.fn>,
		).mockImplementation(function () {
			return mockInterceptor as unknown as InstanceType<
				typeof InterceptedStream
			>;
		});

		await getInitializedPlayer(mockClient);

		const mockReadable = new Readable();

		mockReadable.pipe = vi.fn().mockReturnValue('piped-result');
		mockReadable.on = vi.fn();

		const mockTrack: MockTrack = {
			url: 'https://example.com/track',
			setMetadata: vi.fn(),
		};
		const result = await onStreamExtractedCallback?.(mockReadable, mockTrack);

		expect(createWriteStream).toHaveBeenCalledWith(
			'/mock/cache/path/aHR0cHM6Ly9leGFtcGxlLmNvbS90cmFjaw.opus',
		);
		expect(mockInterceptor.interceptors.add).toHaveBeenCalledWith(
			mockWriteStream,
		);
		expect(mockReadable.pipe).toHaveBeenCalledWith(mockInterceptor);
		expect(result).toBe('piped-result');
	});

	it('should handle non-Readable stream with caching', async () => {
		const mockWriteStream: MockWriteStream = { on: vi.fn() };
		const mockInterceptor: MockInterceptor = { interceptors: { add: vi.fn() } };

		vi.mocked(createWriteStream).mockReturnValue(
			mockWriteStream as unknown as import('fs').WriteStream,
		);
		vi.mocked(
			InterceptedStream as unknown as ReturnType<typeof vi.fn>,
		).mockImplementation(function () {
			return mockInterceptor as unknown as InstanceType<
				typeof InterceptedStream
			>;
		});

		await getInitializedPlayer(mockClient);

		const mockStream = new Readable();

		mockStream.pipe = vi.fn().mockReturnValue('piped-result');
		mockStream.on = vi.fn();

		const streamObj = {
			stream: mockStream,
			$fmt: 'opus',
		};

		const mockTrack: MockTrack = {
			url: 'https://example.com/track',
			setMetadata: vi.fn(),
		};
		const result = await onStreamExtractedCallback?.(streamObj, mockTrack);

		expect(result).toEqual({
			stream: 'piped-result',
			$fmt: 'opus',
		});
	});

	it('should trigger cleanup on writeStream error', async () => {
		const mockWriteStream: MockWriteStream = {
			on: vi.fn(),
		};

		vi.mocked(createWriteStream).mockReturnValue(
			mockWriteStream as unknown as import('fs').WriteStream,
		);

		await getInitializedPlayer(mockClient);

		const mockReadable = new Readable();

		mockReadable.pipe = vi.fn();
		mockReadable.on = vi.fn();

		const mockTrack: MockTrack = {
			url: 'https://example.com/track',
			setMetadata: vi.fn(),
		};

		await onStreamExtractedCallback?.(mockReadable, mockTrack);

		const errorCallback = mockWriteStream.on.mock.calls.find(
			(call: unknown[]) => call[0] === 'error',
		)?.[1] as ((error: Error) => Promise<void>) | undefined;

		expect(errorCallback).toBeDefined();

		if (errorCallback) {
			await errorCallback(new Error('Write error'));
		}

		expect(errorCallback).toBeDefined();
	});

	it('should trigger cleanup on readable error', async () => {
		const mockWriteStream: MockWriteStream = { on: vi.fn() };

		vi.mocked(createWriteStream).mockReturnValue(
			mockWriteStream as unknown as import('fs').WriteStream,
		);

		await getInitializedPlayer(mockClient);

		const mockReadable = new Readable();

		mockReadable.pipe = vi.fn();

		const mockOn = vi.fn();

		mockReadable.on = mockOn;

		const mockTrack: MockTrack = {
			url: 'https://example.com/track',
			setMetadata: vi.fn(),
		};

		await onStreamExtractedCallback?.(mockReadable, mockTrack);

		const errorCallback = mockOn.mock.calls.find(
			(call: unknown[]) => call[0] === 'error',
		)?.[1] as (() => Promise<void>) | undefined;

		expect(errorCallback).toBeDefined();

		if (errorCallback) {
			await errorCallback();
		}

		expect(errorCallback).toBeDefined();
	});

	it('should fallback on createWriteStream error', async () => {
		vi.mocked(createWriteStream).mockImplementation(() => {
			throw new Error('Cannot create write stream');
		});

		await getInitializedPlayer(mockClient);

		const mockReadable = new Readable();
		const mockTrack: MockTrack = {
			url: 'https://example.com/track',
			setMetadata: vi.fn(),
		};

		const result = await onStreamExtractedCallback?.(mockReadable, mockTrack);

		expect(result).toBe(mockReadable);
	});

	it('should trigger cleanup on readable close when active write exists', async () => {
		const mockWriteStream: MockWriteStream = { on: vi.fn() };

		vi.mocked(createWriteStream).mockReturnValue(
			mockWriteStream as unknown as import('fs').WriteStream,
		);

		await getInitializedPlayer(mockClient);

		const mockReadable = new Readable();

		mockReadable.pipe = vi.fn();

		const mockOn = vi.fn();

		mockReadable.on = mockOn;

		const mockTrack: MockTrack = {
			url: 'https://example.com/track',
			setMetadata: vi.fn(),
		};

		await onStreamExtractedCallback?.(mockReadable, mockTrack);

		const closeCallback = mockOn.mock.calls.find(
			(call: unknown[]) => call[0] === 'close',
		)?.[1] as (() => void) | undefined;

		expect(closeCallback).toBeDefined();

		if (closeCallback) {
			closeCallback();
		}

		expect(closeCallback).toBeDefined();
	});

	it('should clean up active writes on writeStream close', async () => {
		const mockWriteStream: MockWriteStream = { on: vi.fn() };

		vi.mocked(createWriteStream).mockReturnValue(
			mockWriteStream as unknown as import('fs').WriteStream,
		);

		await getInitializedPlayer(mockClient);

		const mockReadable = new Readable();

		mockReadable.pipe = vi.fn();
		mockReadable.on = vi.fn();

		const mockTrack: MockTrack = {
			url: 'https://example.com/track',
			setMetadata: vi.fn(),
		};

		await onStreamExtractedCallback?.(mockReadable, mockTrack);

		const closeCallback = mockWriteStream.on.mock.calls.find(
			(call: unknown[]) => call[0] === 'close',
		)?.[1] as (() => void) | undefined;

		expect(closeCallback).toBeDefined();

		if (closeCallback) {
			closeCallback();
		}

		expect(closeCallback).toBeDefined();
	});

	it('should fallback on createWriteStream error for non-Readable stream', async () => {
		vi.mocked(createWriteStream).mockImplementation(() => {
			throw new Error('Cannot create write stream');
		});

		await getInitializedPlayer(mockClient);

		const mockStream = new Readable();

		const streamObj = {
			stream: mockStream,
			$fmt: 'opus',
		};

		const mockTrack: MockTrack = {
			url: 'https://example.com/track',
			setMetadata: vi.fn(),
		};

		const result = await onStreamExtractedCallback?.(streamObj, mockTrack);

		expect(result).toBe(streamObj);
	});
});
