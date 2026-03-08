import type { Server } from 'node:net';
import type { Client, TextChannel } from 'discord.js';
import type { GuildQueue } from 'discord-player';
import { useQueue } from 'discord-player';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import setupGracefulShutdown from '../gracefulShutdown';
import logger from '../logger';
import { QueueRecoveryService } from '../QueueRecoveryService';
import redis from '../redis';

vi.mock('discord-player', () => ({
	useQueue: vi.fn(),
}));

vi.mock('../getEnvironmentVariable', () => ({
	default: vi.fn().mockReturnValue('test-debug-channel-id'),
}));

vi.mock('../QueueRecoveryService', () => ({
	QueueRecoveryService: {
		getInstance: vi.fn(),
	},
}));

const mockedUseQueue = vi.mocked(useQueue);
const mockedQueueRecoveryService = vi.mocked(QueueRecoveryService);
const mockedRedis = vi.mocked(redis);
const mockedLogger = vi.mocked(logger);

let mockClient: Client;
let mockServer: Server;
let mockChannel: TextChannel;
let processExitSpy: ReturnType<typeof vi.spyOn>;
let sigTermListenersBefore: NodeJS.SignalsListener[];

beforeEach(() => {
	vi.clearAllMocks();
	vi.useFakeTimers();

	sigTermListenersBefore = [
		...(process.listeners('SIGTERM') as NodeJS.SignalsListener[]),
	];

	processExitSpy = vi
		.spyOn(process, 'exit')
		.mockImplementation(() => undefined as never);

	mockChannel = {
		isSendable: vi.fn().mockReturnValue(true),
		send: vi.fn().mockResolvedValue(undefined),
	} as unknown as TextChannel;

	mockClient = {
		guilds: {
			cache: {
				first: vi.fn().mockReturnValue({ id: 'test-guild-id' }),
			},
		},
		channels: {
			cache: {
				get: vi.fn().mockReturnValue(mockChannel),
			},
		},
		destroy: vi.fn(),
	} as unknown as Client;

	mockServer = {
		close: vi.fn(),
	} as unknown as Server;

	mockedRedis.set.mockResolvedValue('OK');
});

afterEach(() => {
	const currentListeners = process.listeners(
		'SIGTERM',
	) as NodeJS.SignalsListener[];

	for (const listener of currentListeners) {
		if (!sigTermListenersBefore.includes(listener)) {
			process.removeListener('SIGTERM', listener);
		}
	}

	vi.useRealTimers();
	processExitSpy.mockRestore();
});

const emitSigterm = async () => {
	process.emit('SIGTERM', 'SIGTERM');
	await vi.advanceTimersByTimeAsync(0);
};

it('should register a SIGTERM handler', () => {
	const processOnSpy = vi.spyOn(process, 'on');

	setupGracefulShutdown(mockClient, mockServer);

	expect(processOnSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));

	processOnSpy.mockRestore();
});

it('should save queue and exit gracefully on SIGTERM', async () => {
	const mockQueue = { id: 'test-queue' } as unknown as GuildQueue;
	const mockSaveQueue = vi.fn().mockResolvedValue(undefined);

	mockedUseQueue.mockReturnValue(mockQueue);
	mockedQueueRecoveryService.getInstance.mockReturnValue({
		saveQueue: mockSaveQueue,
	} as unknown as QueueRecoveryService);

	setupGracefulShutdown(mockClient, mockServer);
	await emitSigterm();

	expect(mockedUseQueue).toHaveBeenCalledWith('test-guild-id');
	expect(mockSaveQueue).toHaveBeenCalledWith(mockQueue);
	expect(mockedRedis.set).toHaveBeenCalledWith(
		'discord-bot:shutdown-reason',
		'graceful',
		'EX',
		300,
	);
	expect(mockChannel.send).toHaveBeenCalledWith(
		'Shutting down gracefully, queue saved.',
	);
	expect(mockServer.close).toHaveBeenCalled();
	expect(mockClient.destroy).toHaveBeenCalled();
	expect(processExitSpy).toHaveBeenCalledWith(0);
});

it('should skip queue save when no guild exists', async () => {
	(mockClient.guilds.cache.first as ReturnType<typeof vi.fn>).mockReturnValue(
		undefined,
	);

	setupGracefulShutdown(mockClient, mockServer);
	await emitSigterm();

	expect(mockedUseQueue).not.toHaveBeenCalled();
	expect(mockedRedis.set).toHaveBeenCalled();
	expect(processExitSpy).toHaveBeenCalledWith(0);
});

it('should skip queue save when no active queue exists', async () => {
	mockedUseQueue.mockReturnValue(null);

	setupGracefulShutdown(mockClient, mockServer);
	await emitSigterm();

	expect(mockedUseQueue).toHaveBeenCalledWith('test-guild-id');
	expect(mockedQueueRecoveryService.getInstance).not.toHaveBeenCalled();
	expect(processExitSpy).toHaveBeenCalledWith(0);
});

it('should skip sending message when debug channel is not sendable', async () => {
	mockedUseQueue.mockReturnValue(null);

	const nonSendableChannel = {
		isSendable: vi.fn().mockReturnValue(false),
		send: vi.fn(),
	} as unknown as TextChannel;

	(mockClient.channels.cache.get as ReturnType<typeof vi.fn>).mockReturnValue(
		nonSendableChannel,
	);

	setupGracefulShutdown(mockClient, mockServer);
	await emitSigterm();

	expect(nonSendableChannel.send).not.toHaveBeenCalled();
	expect(processExitSpy).toHaveBeenCalledWith(0);
});

it('should exit with code 1 on error', async () => {
	mockedRedis.set.mockRejectedValue(new Error('Redis error'));
	mockedUseQueue.mockReturnValue(null);

	setupGracefulShutdown(mockClient, mockServer);
	await emitSigterm();

	expect(mockedLogger.error).toHaveBeenCalledWith(
		expect.any(Error),
		'Error during graceful shutdown',
	);
	expect(processExitSpy).toHaveBeenCalledWith(1);
});

it('should force exit after timeout', async () => {
	mockedUseQueue.mockReturnValue(null);
	mockedRedis.set.mockImplementation(() => new Promise(() => {}));

	setupGracefulShutdown(mockClient, mockServer);
	process.emit('SIGTERM', 'SIGTERM');

	await vi.advanceTimersByTimeAsync(5000);

	expect(mockedLogger.error).toHaveBeenCalledWith(
		'Graceful shutdown timed out, forcing exit',
	);
	expect(processExitSpy).toHaveBeenCalledWith(1);
});
