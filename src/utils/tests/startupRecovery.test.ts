import type { Client, TextChannel } from 'discord.js';
import type { Player, Track } from 'discord-player';
import { beforeEach, expect, it, vi } from 'vitest';
import type { ProcessingInteraction } from '../../types/ProcessingInteraction';
import enqueueTracks from '../enqueueTracks';
import logger from '../logger';
import { QueueRecoveryService } from '../QueueRecoveryService';
import redis from '../redis';
import performStartupRecovery from '../startupRecovery';

vi.mock('../getEnvironmentVariable', () => ({
	default: vi.fn().mockReturnValue('test-debug-channel-id'),
}));

vi.mock('../QueueRecoveryService', () => ({
	QueueRecoveryService: {
		getInstance: vi.fn(),
	},
}));

vi.mock('../enqueueTracks', () => ({
	default: vi.fn(),
}));

const mockedRedis = vi.mocked(redis);
const mockedQueueRecoveryService = vi.mocked(QueueRecoveryService);
const mockedEnqueueTracks = vi.mocked(enqueueTracks);
const mockedLogger = vi.mocked(logger);

let mockChannel: TextChannel;
let mockMessage: { edit: ReturnType<typeof vi.fn> };
let mockPlayer: Player;

function createMockClient(
	overrides: {
		user?: unknown;
		voiceChannelMembers?: unknown[];
		hasVoiceChannel?: boolean;
		hasGuild?: boolean;
		channelSendable?: boolean;
	} = {},
): Client {
	const {
		user = { id: 'bot-user' },
		voiceChannelMembers = [{ user: { bot: false } }],
		hasVoiceChannel = true,
		hasGuild = true,
		channelSendable = true,
	} = overrides;

	const voiceChannel = {
		id: 'test-voice-channel',
		isVoiceBased: vi.fn().mockReturnValue(true),
		members: {
			filter: vi.fn().mockReturnValue({ size: voiceChannelMembers.length }),
		},
	};

	const guildChannels = hasVoiceChannel ? [voiceChannel] : [];

	const guild = {
		id: 'test-guild-id',
		channels: {
			cache: {
				find: vi
					.fn()
					.mockImplementation((predicate: (ch: unknown) => boolean) =>
						guildChannels.find(predicate),
					),
			},
		},
	};

	mockMessage = { edit: vi.fn().mockResolvedValue(undefined) };

	mockChannel = {
		isSendable: vi.fn().mockReturnValue(channelSendable),
		send: vi.fn().mockResolvedValue(mockMessage),
	} as unknown as TextChannel;

	return {
		user,
		guilds: {
			cache: {
				first: vi.fn().mockReturnValue(hasGuild ? guild : undefined),
			},
		},
		channels: {
			cache: {
				get: vi.fn().mockReturnValue(mockChannel),
			},
		},
	} as unknown as Client;
}

function createMockTracks(count = 2): Track[] {
	return Array.from({ length: count }, (_, index) => ({
		url: `https://example.com/track-${index + 1}`,
		title: `Track ${index + 1}`,
		author: `Artist ${index + 1}`,
	})) as unknown as Track[];
}

beforeEach(() => {
	vi.clearAllMocks();

	mockPlayer = { id: 'test-player' } as unknown as Player;
});

it('should auto-recover queue after graceful shutdown', async () => {
	const tracks = createMockTracks(2);
	const mockClient = createMockClient();

	mockedRedis.get.mockResolvedValue('graceful');
	mockedRedis.del.mockResolvedValue(1);
	mockedQueueRecoveryService.getInstance.mockReturnValue({
		getContents: vi.fn().mockResolvedValue({ tracks, progress: 5000 }),
	} as unknown as QueueRecoveryService);
	mockedEnqueueTracks.mockResolvedValue(undefined);

	await performStartupRecovery(mockClient, mockPlayer);

	expect(mockedRedis.del).toHaveBeenCalledWith('discord-bot:shutdown-reason');
	expect(mockChannel.send).toHaveBeenCalledWith('Starting auto-recovery…');
	expect(mockedEnqueueTracks).toHaveBeenCalledWith(
		expect.objectContaining({
			tracks,
			progress: 5000,
			voiceChannel: expect.objectContaining({ id: 'test-voice-channel' }),
			interaction: expect.objectContaining({
				user: { id: 'bot-user' },
				channel: mockChannel,
			}),
		}),
	);
});

it('should delete Redis key and skip recovery when no tracks saved', async () => {
	const mockClient = createMockClient();

	mockedRedis.get.mockResolvedValue('graceful');
	mockedRedis.del.mockResolvedValue(1);
	mockedQueueRecoveryService.getInstance.mockReturnValue({
		getContents: vi.fn().mockResolvedValue({ tracks: [], progress: 0 }),
	} as unknown as QueueRecoveryService);

	await performStartupRecovery(mockClient, mockPlayer);

	expect(mockedRedis.del).toHaveBeenCalledWith('discord-bot:shutdown-reason');
	expect(mockedEnqueueTracks).not.toHaveBeenCalled();
	expect(mockChannel.send).not.toHaveBeenCalled();
});

it('should skip recovery when no guild exists', async () => {
	const tracks = createMockTracks();
	const mockClient = createMockClient({ hasGuild: false });

	mockedRedis.get.mockResolvedValue('graceful');
	mockedRedis.del.mockResolvedValue(1);
	mockedQueueRecoveryService.getInstance.mockReturnValue({
		getContents: vi.fn().mockResolvedValue({ tracks, progress: 0 }),
	} as unknown as QueueRecoveryService);

	await performStartupRecovery(mockClient, mockPlayer);

	expect(mockedEnqueueTracks).not.toHaveBeenCalled();
});

it('should skip recovery when no voice channel has members', async () => {
	const tracks = createMockTracks();
	const mockClient = createMockClient({ voiceChannelMembers: [] });

	mockedRedis.get.mockResolvedValue('graceful');
	mockedRedis.del.mockResolvedValue(1);
	mockedQueueRecoveryService.getInstance.mockReturnValue({
		getContents: vi.fn().mockResolvedValue({ tracks, progress: 0 }),
	} as unknown as QueueRecoveryService);

	await performStartupRecovery(mockClient, mockPlayer);

	expect(mockedEnqueueTracks).not.toHaveBeenCalled();
});

it('should skip recovery when client user is null', async () => {
	const tracks = createMockTracks();
	const mockClient = createMockClient({ user: null });

	mockedRedis.get.mockResolvedValue('graceful');
	mockedRedis.del.mockResolvedValue(1);
	mockedQueueRecoveryService.getInstance.mockReturnValue({
		getContents: vi.fn().mockResolvedValue({ tracks, progress: 0 }),
	} as unknown as QueueRecoveryService);

	await performStartupRecovery(mockClient, mockPlayer);

	expect(mockedEnqueueTracks).not.toHaveBeenCalled();
});

it('should suggest `/recover` after a crash when saved tracks exist', async () => {
	const tracks = createMockTracks();
	const mockClient = createMockClient();

	mockedRedis.get.mockResolvedValue(null);
	mockedQueueRecoveryService.getInstance.mockReturnValue({
		getContents: vi.fn().mockResolvedValue({ tracks, progress: 0 }),
	} as unknown as QueueRecoveryService);

	await performStartupRecovery(mockClient, mockPlayer);

	expect(mockedEnqueueTracks).not.toHaveBeenCalled();
	expect(mockChannel.send).toHaveBeenCalledWith(
		'Found a saved queue from a previous session. Use `/recover` to restore it.',
	);
});

it('should not send crash message when no saved tracks exist', async () => {
	const mockClient = createMockClient();

	mockedRedis.get.mockResolvedValue(null);
	mockedQueueRecoveryService.getInstance.mockReturnValue({
		getContents: vi.fn().mockResolvedValue({ tracks: [], progress: 0 }),
	} as unknown as QueueRecoveryService);

	await performStartupRecovery(mockClient, mockPlayer);

	expect(mockChannel.send).not.toHaveBeenCalled();
});

it('should not send crash message when channel is not sendable', async () => {
	const tracks = createMockTracks();
	const mockClient = createMockClient({ channelSendable: false });

	mockedRedis.get.mockResolvedValue(null);
	mockedQueueRecoveryService.getInstance.mockReturnValue({
		getContents: vi.fn().mockResolvedValue({ tracks, progress: 0 }),
	} as unknown as QueueRecoveryService);

	await performStartupRecovery(mockClient, mockPlayer);

	expect(mockChannel.send).not.toHaveBeenCalled();
});

it('should catch and log errors without throwing', async () => {
	const mockClient = createMockClient();

	mockedRedis.get.mockRejectedValue(new Error('Redis connection failed'));

	await performStartupRecovery(mockClient, mockPlayer);

	expect(mockedLogger.error).toHaveBeenCalledWith(
		expect.any(Error),
		'Startup recovery failed',
	);
});

it('should pass message edit handler as interaction reply and editReply', async () => {
	const tracks = createMockTracks(1);
	const mockClient = createMockClient();

	mockedRedis.get.mockResolvedValue('graceful');
	mockedRedis.del.mockResolvedValue(1);
	mockedQueueRecoveryService.getInstance.mockReturnValue({
		getContents: vi.fn().mockResolvedValue({ tracks, progress: 0 }),
	} as unknown as QueueRecoveryService);

	let capturedInteraction:
		| {
				editReply: (options: Record<string, unknown>) => Promise<unknown>;
				reply: (options: Record<string, unknown>) => Promise<unknown>;
		  }
		| undefined;

	mockedEnqueueTracks.mockImplementation(async ({ interaction }) => {
		capturedInteraction = interaction;
	});

	await performStartupRecovery(mockClient, mockPlayer);

	expect(capturedInteraction).toBeDefined();
	expect(capturedInteraction?.editReply).toBe(capturedInteraction?.reply);

	await capturedInteraction?.editReply({ content: 'test', flags: 64 });

	expect(mockMessage.edit).toHaveBeenCalledWith({ content: 'test' });
});

it('should handle string argument in message handler', async () => {
	const tracks = createMockTracks(1);
	const mockClient = createMockClient();

	mockedRedis.get.mockResolvedValue('graceful');
	mockedRedis.del.mockResolvedValue(1);
	mockedQueueRecoveryService.getInstance.mockReturnValue({
		getContents: vi.fn().mockResolvedValue({ tracks, progress: 0 }),
	} as unknown as QueueRecoveryService);

	let capturedInteraction: ProcessingInteraction | undefined;

	mockedEnqueueTracks.mockImplementation(async ({ interaction }) => {
		capturedInteraction = interaction;
	});

	await performStartupRecovery(mockClient, mockPlayer);

	expect(capturedInteraction).toBeDefined();

	await capturedInteraction?.reply(
		'string message' as unknown as Parameters<
			ProcessingInteraction['reply']
		>[0],
	);

	expect(mockMessage.edit).toHaveBeenCalledWith('string message');
});
