import type { Server } from 'node:net';
import { createServer } from 'node:net';
import { captureException } from '@sentry/node';
import type { Client, TextChannel } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import type { GuildQueue, Player } from 'discord-player';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import getEnvironmentVariable from '../../utils/getEnvironmentVariable';
import logger from '../../utils/logger';
import useDebugListeners from '../useDebugListeners';

const TEST_DEBUG_CHANNEL_ID = 'test-debug-channel-id';
const TEST_SENTRY_ID = 'test-sentry-id';

vi.mock('discord.js', () => ({
	EmbedBuilder: vi.fn(),
}));

vi.mock('../../utils/QueueRecoveryService', () => ({
	QueueRecoveryService: {
		getInstance: vi.fn(),
	},
}));

const mockOpusCacheManagerInstance = vi.hoisted(() => ({
	generateFilename: vi.fn().mockReturnValue('mock_filename.opus'),
	deleteEntry: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../utils/OpusCacheManager', () => ({
	OpusCacheManager: {
		getInstance: vi.fn(() => mockOpusCacheManagerInstance),
	},
}));

vi.mock('../../utils/getEnvironmentVariable', () => ({
	default: vi.fn(),
}));

vi.mock('node:net', () => {
	const mockServer = {
		listen: vi.fn(),
		close: vi.fn(),
	};

	const createServerMock = vi.fn(() => mockServer);

	(
		createServerMock as unknown as { mockServer: typeof mockServer }
	).mockServer = mockServer;

	return {
		createServer: createServerMock,
	};
});

const mockedCaptureException = vi.mocked(captureException);
const mockedGetEnvironmentVariable = vi.mocked(getEnvironmentVariable);
const mockedLogger = vi.mocked(logger);
const mockedCreateServer = vi.mocked(createServer);

let mockClient: Client<boolean>;
let mockPlayer: Player;
let mockChannel: TextChannel;
let mockServer: Server;
let mockEmbed: EmbedBuilder;

beforeEach(() => {
	vi.clearAllMocks();

	mockOpusCacheManagerInstance.generateFilename.mockReturnValue(
		'mock_filename.opus',
	);

	vi.mocked(EmbedBuilder).mockImplementation(function () {
		mockEmbed = {
			setTitle: vi.fn().mockReturnThis(),
			setDescription: vi.fn().mockReturnThis(),
			setColor: vi.fn().mockReturnThis(),
			setFields: vi.fn().mockReturnThis(),
			addFields: vi.fn().mockReturnThis(),
			setFooter: vi.fn().mockReturnThis(),
			data: {},
		} as unknown as EmbedBuilder;
		return mockEmbed;
	});

	mockedGetEnvironmentVariable.mockImplementation((key: string) => {
		if (key === 'BOT_DEBUG_CHANNEL_ID') return TEST_DEBUG_CHANNEL_ID;
		if (key === 'NODE_ENV') return 'test';
		return 'mock-value';
	});

	mockedCaptureException.mockReturnValue(TEST_SENTRY_ID);

	mockServer = {
		listen: vi.fn(),
		close: vi.fn(),
	} as unknown as Server;
	mockedCreateServer.mockReturnValue(mockServer);

	mockEmbed = {
		setTitle: vi.fn().mockReturnThis(),
		setDescription: vi.fn().mockReturnThis(),
		setColor: vi.fn().mockReturnThis(),
		setFields: vi.fn().mockReturnThis(),
	} as unknown as EmbedBuilder;

	mockChannel = {
		isSendable: vi.fn().mockReturnValue(true),
		send: vi.fn().mockResolvedValue(undefined),
	} as unknown as TextChannel;

	mockClient = {
		on: vi.fn(),
		channels: {
			cache: {
				get: vi.fn().mockReturnValue(mockChannel),
			},
		},
	} as unknown as Client<boolean>;

	mockPlayer = {
		on: vi.fn(),
		events: {
			on: vi.fn(),
		},
	} as unknown as Player;
});

afterEach(() => {
	vi.resetAllMocks();
});

const getClientErrorHandler = () => {
	const clientOnCalls = vi.mocked(mockClient.on).mock.calls;
	const errorHandlerCall = clientOnCalls.find((call) => call[0] === 'error');

	expect(errorHandlerCall).toBeDefined();

	return errorHandlerCall?.[1] as (error: Error) => void;
};

const getPlayerErrorHandler = () => {
	const playerOnCalls = vi.mocked(mockPlayer.on).mock.calls;
	const errorHandlerCall = playerOnCalls.find((call) => call[0] === 'error');

	expect(errorHandlerCall).toBeDefined();

	return errorHandlerCall?.[1] as (error: Error) => Promise<void>;
};

const getPlayerEventsErrorHandler = () => {
	const playerEventsOnCalls = vi.mocked(mockPlayer.events.on).mock.calls;
	const errorHandlerCall = playerEventsOnCalls.find(
		(call) => call[0] === 'error',
	);

	expect(errorHandlerCall).toBeDefined();

	return errorHandlerCall?.[1] as (
		queue: GuildQueue,
		error: Error,
	) => Promise<void>;
};

const createMockQueue = (
	overrides: Partial<{
		channel: unknown;
		currentTrack: unknown;
		metadata: unknown;
		node: unknown;
	}> = {},
) => {
	const defaults = {
		channel: { id: 'test-voice-channel' },
		currentTrack: {
			url: 'test-current-track',
			title: 'Test Track',
			cleanTitle: 'Test Track',
			author: 'Test Artist',
			durationMS: 180000,
			metadata: { someProperty: 'value' },
		},
		node: { skip: vi.fn() },
	};

	return { ...defaults, ...overrides } as unknown as GuildQueue;
};

describe('Basic Setup', () => {
	it('should set up debug listeners and create server', () => {
		useDebugListeners(mockClient, mockPlayer);

		expect(mockClient.on).toHaveBeenCalledWith('error', expect.any(Function));

		expect(mockPlayer.on).toHaveBeenCalledWith('error', expect.any(Function));
		expect(mockPlayer.on).toHaveBeenCalledWith('debug', expect.any(Function));
		expect(mockPlayer.events.on).toHaveBeenCalledWith(
			'error',
			expect.any(Function),
		);
		expect(mockPlayer.events.on).toHaveBeenCalledWith(
			'playerError',
			expect.any(Function),
		);
		expect(mockPlayer.events.on).toHaveBeenCalledWith(
			'debug',
			expect.any(Function),
		);
	});

	it('should register process error handlers', () => {
		const processOnSpy = vi.spyOn(process, 'on');

		useDebugListeners(mockClient, mockPlayer);

		expect(processOnSpy).toHaveBeenCalledWith(
			'unhandledRejection',
			expect.any(Function),
		);
		expect(processOnSpy).toHaveBeenCalledWith(
			'uncaughtException',
			expect.any(Function),
		);

		processOnSpy.mockRestore();
	});

	it('should handle player debug messages', () => {
		useDebugListeners(mockClient, mockPlayer);
		const playerOnCalls = vi.mocked(mockPlayer.on).mock.calls;
		const debugHandlerCall = playerOnCalls.find((call) => call[0] === 'debug');

		expect(debugHandlerCall).toBeDefined();
		const debugHandler = debugHandlerCall?.[1] as (message: string) => void;
		debugHandler('Test debug message');

		expect(mockedLogger.debug).toHaveBeenCalledWith({}, 'Test debug message');
	});

	it('should handle player events debug messages', () => {
		useDebugListeners(mockClient, mockPlayer);
		const playerEventsOnCalls = vi.mocked(mockPlayer.events.on).mock.calls;
		const debugHandlerCall = playerEventsOnCalls.find(
			(call) => call[0] === 'debug',
		);

		expect(debugHandlerCall).toBeDefined();
		const debugHandler = debugHandlerCall?.[1] as (
			queue: GuildQueue,
			message: string,
		) => void;
		debugHandler(createMockQueue(), 'Test debug message');

		expect(mockedLogger.debug).toHaveBeenCalledWith({}, 'Test debug message');
	});
});

describe('Client Error Handling', () => {
	it('should handle client errors and log them', () => {
		const testError = new Error('Test client error');

		useDebugListeners(mockClient, mockPlayer);
		const errorHandler = getClientErrorHandler();
		errorHandler(testError);

		expect(mockedLogger.error).toHaveBeenCalledWith(
			testError,
			'Discord client error',
		);
		expect(mockedCaptureException).toHaveBeenCalledWith(testError);
	});

	it('should not send debug messages in development mode', () => {
		mockedGetEnvironmentVariable.mockImplementation((key: string) => {
			if (key === 'BOT_DEBUG_CHANNEL_ID') return TEST_DEBUG_CHANNEL_ID;
			if (key === 'NODE_ENV') return 'development';
			return 'mock-value';
		});

		const testError = new Error('Test unhandled error');

		useDebugListeners(mockClient, mockPlayer);

		process.emit('unhandledRejection', testError, Promise.resolve());

		expect(mockedLogger.error).toHaveBeenCalledWith(
			testError,
			'Uncaught exception/rejection',
		);
		expect(mockedCaptureException).toHaveBeenCalledWith(testError);
		expect(mockChannel.send).not.toHaveBeenCalled();
		expect(mockServer.close).not.toHaveBeenCalled();
	});

	it('should send debug message and close server in production mode', async () => {
		mockedGetEnvironmentVariable.mockImplementation((key: string) => {
			if (key === 'BOT_DEBUG_CHANNEL_ID') return TEST_DEBUG_CHANNEL_ID;
			if (key === 'NODE_ENV') return 'production';
			return 'mock-value';
		});

		const mockServer = (mockedCreateServer as unknown as { mockServer: Server })
			.mockServer;
		const serverCloseSpy = vi.spyOn(mockServer, 'close');

		const testError = new Error('Test unhandled error');

		useDebugListeners(mockClient, mockPlayer);

		process.emit('unhandledRejection', testError, Promise.resolve());

		await new Promise((resolve) => setTimeout(resolve, 100));

		expect(mockedLogger.error).toHaveBeenCalledWith(
			testError,
			'Uncaught exception/rejection',
		);
		expect(mockedCaptureException).toHaveBeenCalledWith(testError);
		expect(mockChannel.send).toHaveBeenCalled();
		expect(serverCloseSpy).toHaveBeenCalled();
	});
});

describe('Player Error Handling', () => {
	it('should report error to Sentry and send embed to debug channel', async () => {
		const testError = new Error('Test player error');
		const mockQueue = createMockQueue();

		useDebugListeners(mockClient, mockPlayer);
		const errorHandler = getPlayerEventsErrorHandler();
		await errorHandler(mockQueue, testError);

		expect(mockedLogger.error).toHaveBeenCalledWith(testError, 'Player error');
		expect(mockedCaptureException).toHaveBeenCalledWith(testError);
		expect(mockChannel.send).toHaveBeenCalledWith({ embeds: [mockEmbed] });
		expect(mockEmbed.setTitle).toHaveBeenCalledWith('Player Error');
		expect(mockEmbed.setDescription).toHaveBeenCalledWith(
			'Could not stream **Test Track** by Test Artist. Skipping to the next track.',
		);
		expect(mockEmbed.setColor).toHaveBeenCalledWith('Red');
		expect(mockEmbed.setFields).toHaveBeenCalledWith([
			{
				name: 'Sentry Issue ID',
				value: `\`${TEST_SENTRY_ID}\``,
			},
		]);
	});

	it('should show "Unavailable" when Sentry returns null', async () => {
		mockedCaptureException.mockReturnValue(null as unknown as string);

		const testError = new Error('Test player error');
		const mockQueue = createMockQueue();

		useDebugListeners(mockClient, mockPlayer);
		const errorHandler = getPlayerEventsErrorHandler();
		await errorHandler(mockQueue, testError);

		expect(mockedCaptureException).toHaveBeenCalledWith(testError);
		expect(mockEmbed.setFields).toHaveBeenCalledWith([
			{
				name: 'Sentry Issue ID',
				value: 'Unavailable',
			},
		]);
	});

	it('should handle player error with no queue (unknown track)', async () => {
		const testError = new Error('Test player error');

		useDebugListeners(mockClient, mockPlayer);
		const errorHandler = getPlayerErrorHandler();
		await errorHandler(testError);

		expect(mockedLogger.error).toHaveBeenCalledWith(testError, 'Player error');
		expect(mockedCaptureException).toHaveBeenCalledWith(testError);
		expect(mockChannel.send).toHaveBeenCalledWith({ embeds: [mockEmbed] });
		expect(mockEmbed.setDescription).toHaveBeenCalledWith(
			'Could not stream Unknown track. Skipping to the next track.',
		);
	});

	it('should handle NoResultError without Sentry reporting', async () => {
		const testError = new Error('Test NoResult error');
		testError.name = 'NoResultError';
		const mockQueue = createMockQueue({
			currentTrack: {
				title: 'Test Song',
				author: 'Test Artist',
				url: 'test-url',
			},
		});

		useDebugListeners(mockClient, mockPlayer);
		const errorHandler = getPlayerEventsErrorHandler();
		await errorHandler(mockQueue, testError);

		expect(mockedLogger.error).toHaveBeenCalledWith(testError, 'Player error');
		expect(mockedCaptureException).not.toHaveBeenCalled();
		expect(mockChannel.send).toHaveBeenCalledWith({ embeds: [mockEmbed] });
		expect(mockEmbed.setTitle).toHaveBeenCalledWith('Track Unavailable');
		expect(mockEmbed.setDescription).toHaveBeenCalledWith(
			'Could not play **Test Song** by Test Artist.\n\nThis track appears to be unplayable (possibly region-locked, removed, or restricted). The queue will continue with the next track.',
		);
		expect(mockEmbed.setColor).toHaveBeenCalledWith('Orange');
	});

	it('should handle NoResultError with ERR_NO_RESULT code', async () => {
		const testError = new Error('Test error with code') as Error & {
			code: string;
		};
		testError.code = 'ERR_NO_RESULT';
		const mockQueue = createMockQueue({
			currentTrack: {
				title: 'Another Song',
				author: 'Another Artist',
				url: 'another-url',
			},
		});

		useDebugListeners(mockClient, mockPlayer);
		const errorHandler = getPlayerEventsErrorHandler();
		await errorHandler(mockQueue, testError);

		expect(mockedLogger.error).toHaveBeenCalledWith(testError, 'Player error');
		expect(mockedCaptureException).not.toHaveBeenCalled();
		expect(mockChannel.send).toHaveBeenCalledWith({ embeds: [mockEmbed] });
		expect(mockEmbed.setDescription).toHaveBeenCalledWith(
			'Could not play **Another Song** by Another Artist.\n\nThis track appears to be unplayable (possibly region-locked, removed, or restricted). The queue will continue with the next track.',
		);
	});

	it('should handle NoResultError with unknown track', async () => {
		const testError = new Error('Test NoResult error');
		testError.name = 'NoResultError';
		const mockQueue = createMockQueue({ currentTrack: null });

		useDebugListeners(mockClient, mockPlayer);
		const errorHandler = getPlayerEventsErrorHandler();
		await errorHandler(mockQueue, testError);

		expect(mockedLogger.error).toHaveBeenCalledWith(testError, 'Player error');
		expect(mockedCaptureException).not.toHaveBeenCalled();
		expect(mockChannel.send).toHaveBeenCalledWith({ embeds: [mockEmbed] });
		expect(mockEmbed.setDescription).toHaveBeenCalledWith(
			'Could not play Unknown track.\n\nThis track appears to be unplayable (possibly region-locked, removed, or restricted). The queue will continue with the next track.',
		);
	});
});

describe('Opus Cache Management', () => {
	it('should delete opus cache entry for tracks without `isFromCache`', async () => {
		const mockQueue = createMockQueue();
		const testError = new Error('Test player error');

		useDebugListeners(mockClient, mockPlayer);
		const errorHandler = getPlayerEventsErrorHandler();
		await errorHandler(mockQueue, testError);

		expect(mockOpusCacheManagerInstance.deleteEntry).toHaveBeenCalledWith(
			'mock_filename.opus',
		);
	});

	it('should not delete opus cache entry for tracks with `isFromCache`', async () => {
		const mockQueue = createMockQueue({
			currentTrack: {
				url: 'test-current-track',
				metadata: { isFromCache: true },
			},
		});
		const testError = new Error('Test player error');

		useDebugListeners(mockClient, mockPlayer);
		const errorHandler = getPlayerEventsErrorHandler();
		await errorHandler(mockQueue, testError);

		expect(mockOpusCacheManagerInstance.deleteEntry).not.toHaveBeenCalled();
	});

	it('should not delete opus cache entry when there is no current track', async () => {
		const mockQueue = createMockQueue({ currentTrack: null });
		const testError = new Error('Test NoResult error');
		testError.name = 'NoResultError';

		useDebugListeners(mockClient, mockPlayer);
		const errorHandler = getPlayerEventsErrorHandler();
		await errorHandler(mockQueue, testError);

		expect(mockOpusCacheManagerInstance.deleteEntry).not.toHaveBeenCalled();
	});
});

describe('Debug Channel Validation', () => {
	it('should return early when debug channel is not sendable', async () => {
		const nonSendableChannel = {
			...mockChannel,
			isSendable: vi.fn().mockReturnValue(false),
		};

		mockClient.channels.cache.get = vi.fn().mockReturnValue(nonSendableChannel);

		const testError = new Error('Test player error');
		const mockQueue = createMockQueue();

		useDebugListeners(mockClient, mockPlayer);
		const errorHandler = getPlayerEventsErrorHandler();
		await errorHandler(mockQueue, testError);

		expect(mockedLogger.error).toHaveBeenCalledWith(testError, 'Player error');
		expect(nonSendableChannel.send).not.toHaveBeenCalled();
		expect(mockedCaptureException).not.toHaveBeenCalled();
	});

	it('should return early when debug channel is undefined', async () => {
		mockClient.channels.cache.get = vi.fn().mockReturnValue(undefined);

		const testError = new Error('Test player error');
		const mockQueue = createMockQueue();

		useDebugListeners(mockClient, mockPlayer);
		const errorHandler = getPlayerEventsErrorHandler();
		await errorHandler(mockQueue, testError);

		expect(mockedLogger.error).toHaveBeenCalledWith(testError, 'Player error');
		expect(mockChannel.send).not.toHaveBeenCalled();
		expect(mockedCaptureException).not.toHaveBeenCalled();
	});
});
