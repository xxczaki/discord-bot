import { useMainPlayer, useQueue } from 'discord-player';
import type { GuildQueue, Player, Track } from 'discord-player';
import {
	ActionRowBuilder,
	type ButtonInteraction,
	type ChatInputCommandInteraction,
	type GuildMember,
	type Message,
	type VoiceBasedChannel,
} from 'discord.js';
import { beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS } from '../../constants/miscellaneous';
import { QueueRecoveryService } from '../../utils/QueueRecoveryService';
import enqueueTracks from '../../utils/enqueueTracks';
import isObject from '../../utils/isObject';
import recoverCommandHandler from '../recover';

const EXAMPLE_TRACK_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const EXAMPLE_TRACK_URL_2 = 'https://www.youtube.com/watch?v=abc123def';
const EXAMPLE_PROGRESS = 30000;

vi.mock('discord-player', () => ({
	useMainPlayer: vi.fn(),
	useQueue: vi.fn(),
}));

vi.mock('../../utils/QueueRecoveryService', () => ({
	QueueRecoveryService: {
		getInstance: vi.fn().mockReturnValue({
			getContents: vi.fn(),
			saveQueue: vi.fn(),
			deleteQueue: vi.fn(),
		}),
	},
}));

vi.mock('../../utils/enqueueTracks', () => ({
	default: vi.fn(),
}));

const mockedUseMainPlayer = vi.mocked(useMainPlayer);
const mockedUseQueue = vi.mocked(useQueue);
const mockedQueueRecoveryService = vi.mocked(
	QueueRecoveryService.getInstance(),
);
const mockedEnqueueTracks = vi.mocked(enqueueTracks);

function createMockTrack(url = EXAMPLE_TRACK_URL): Track {
	return {
		id: 'track-123',
		title: 'Test Track',
		author: 'Test Artist',
		url,
		duration: '3:32',
		metadata: {},
	} as Track;
}

function createMockPlayer(): Player {
	return {
		id: 'mock-player',
	} as Player;
}

function createMockVoiceChannel(): VoiceBasedChannel {
	return {
		id: 'voice-channel-123',
		name: 'General',
	} as VoiceBasedChannel;
}

function createMockInteraction(
	hasVoiceChannel = true,
): ChatInputCommandInteraction {
	return {
		member: {
			voice: {
				channel: hasVoiceChannel ? createMockVoiceChannel() : null,
			},
		} as GuildMember,
		user: {
			id: 'user-123',
			username: 'testuser',
		},
		reply: vi.fn().mockResolvedValue({}),
		editReply: vi.fn().mockResolvedValue(createMockResponse()),
	} as unknown as ChatInputCommandInteraction;
}

function createMockResponse(): Message<boolean> {
	return {
		awaitMessageComponent: vi.fn(),
	} as unknown as Message<boolean>;
}

function createMockQueue(): GuildQueue<unknown> {
	return {
		id: 'queue-123',
		tracks: {
			store: [],
		},
	} as unknown as GuildQueue<unknown>;
}

function createMockMessageComponentInteraction(
	customId: string,
): ButtonInteraction {
	return {
		customId,
		editReply: vi.fn().mockResolvedValue({}),
		reply: vi.fn().mockResolvedValue({}),
		user: {
			id: 'user-123',
			username: 'testuser',
		},
		channel: {
			id: 'channel-123',
		},
	} as unknown as ButtonInteraction;
}

beforeEach(() => {
	vi.clearAllMocks();
});

it('should reply with error when user is not in a voice channel', async () => {
	const interaction = createMockInteraction(false);

	await recoverCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith({
		content: 'You are not connected to a voice channel!',
		components: [],
		flags: ['Ephemeral'],
	});
});

it('should reply with error when a queue already exists', async () => {
	const interaction = createMockInteraction();
	const mockQueue = createMockQueue();

	mockedUseQueue.mockReturnValue(mockQueue);

	await recoverCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith(
		'Recovery not possible when a queue already exists. Please purge it first.',
	);
});

it('should reply with "Nothing to recover" when no tracks are found', async () => {
	const interaction = createMockInteraction();
	const mockPlayer = createMockPlayer();

	mockedUseQueue.mockReturnValue(null);
	mockedUseMainPlayer.mockReturnValue(mockPlayer);
	mockedQueueRecoveryService.getContents.mockResolvedValue({
		tracks: [],
		progress: 0,
	});

	await recoverCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith(
		'Looking up what can be recovered…',
	);
	expect(mockedQueueRecoveryService.getContents).toHaveBeenCalledWith(
		mockPlayer,
	);
	expect(interaction.editReply).toHaveBeenCalledWith('Nothing to recover.');
});

it('should show recovery prompt when tracks are found', async () => {
	const interaction = createMockInteraction();
	const mockPlayer = createMockPlayer();
	const tracks = [createMockTrack(), createMockTrack(EXAMPLE_TRACK_URL_2)];
	const mockResponse = createMockResponse();

	vi.mocked(mockResponse.awaitMessageComponent).mockRejectedValue(
		new Error('timeout'),
	);
	vi.mocked(interaction.editReply).mockResolvedValue(mockResponse);

	mockedUseQueue.mockReturnValue(null);
	mockedUseMainPlayer.mockReturnValue(mockPlayer);
	mockedQueueRecoveryService.getContents.mockResolvedValue({
		tracks,
		progress: EXAMPLE_PROGRESS,
	});

	await recoverCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith(
		'Looking up what can be recovered…',
	);
	expect(mockedQueueRecoveryService.getContents).toHaveBeenCalledWith(
		mockPlayer,
	);

	const editReplyCall = vi
		.mocked(interaction.editReply)
		.mock.calls.find((call) => isObject(call[0]) && 'components' in call[0]);
	expect(editReplyCall).toBeDefined();
	expect(editReplyCall?.[0]).toMatchObject({
		components: expect.arrayContaining([expect.any(ActionRowBuilder)]),
	});

	expect(mockResponse.awaitMessageComponent).toHaveBeenCalledWith({
		time: DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS,
	});
});

it('should proceed with recovery when `proceed` button is clicked', async () => {
	const interaction = createMockInteraction();
	const mockPlayer = createMockPlayer();
	const tracks = [createMockTrack(), createMockTrack(EXAMPLE_TRACK_URL_2)];
	const mockResponse = createMockResponse();
	const mockAnswer = createMockMessageComponentInteraction('proceed');

	vi.mocked(mockResponse.awaitMessageComponent).mockResolvedValue(mockAnswer);
	vi.mocked(interaction.editReply).mockResolvedValue(mockResponse);

	mockedUseQueue.mockReturnValue(null);
	mockedUseMainPlayer.mockReturnValue(mockPlayer);
	mockedQueueRecoveryService.getContents.mockResolvedValue({
		tracks,
		progress: EXAMPLE_PROGRESS,
	});
	mockedEnqueueTracks.mockResolvedValue(undefined);

	await recoverCommandHandler(interaction);

	expect(mockedEnqueueTracks).toHaveBeenCalledWith({
		tracks,
		progress: EXAMPLE_PROGRESS,
		voiceChannel: expect.any(Object),
		interaction: {
			editReply: expect.any(Function),
			reply: expect.any(Function),
			user: mockAnswer.user,
			channel: mockAnswer.channel,
		},
	});
});

it('should cancel recovery when `cancel` button is clicked', async () => {
	const interaction = createMockInteraction();
	const mockPlayer = createMockPlayer();
	const tracks = [createMockTrack()];
	const mockResponse = createMockResponse();
	const mockAnswer = createMockMessageComponentInteraction('cancel');

	vi.mocked(mockResponse.awaitMessageComponent).mockResolvedValue(mockAnswer);
	vi.mocked(interaction.editReply).mockResolvedValue(mockResponse);

	mockedUseQueue.mockReturnValue(null);
	mockedUseMainPlayer.mockReturnValue(mockPlayer);
	mockedQueueRecoveryService.getContents.mockResolvedValue({
		tracks,
		progress: EXAMPLE_PROGRESS,
	});

	await recoverCommandHandler(interaction);

	expect(interaction.editReply).toHaveBeenLastCalledWith({
		content: 'The queue will not be recovered.',
		components: [],
	});
	expect(mockedEnqueueTracks).not.toHaveBeenCalled();
});

it('should cancel recovery when button interaction times out', async () => {
	const interaction = createMockInteraction();
	const mockPlayer = createMockPlayer();
	const tracks = [createMockTrack()];
	const mockResponse = createMockResponse();

	vi.mocked(mockResponse.awaitMessageComponent).mockRejectedValue(
		new Error('timeout'),
	);
	vi.mocked(interaction.editReply).mockResolvedValue(mockResponse);

	mockedUseQueue.mockReturnValue(null);
	mockedUseMainPlayer.mockReturnValue(mockPlayer);
	mockedQueueRecoveryService.getContents.mockResolvedValue({
		tracks,
		progress: EXAMPLE_PROGRESS,
	});

	await recoverCommandHandler(interaction);

	expect(interaction.editReply).toHaveBeenLastCalledWith({
		content: 'The queue will not be recovered.',
		components: [],
	});
	expect(mockedEnqueueTracks).not.toHaveBeenCalled();
});

it('should handle unknown button `customId` as cancel', async () => {
	const interaction = createMockInteraction();
	const mockPlayer = createMockPlayer();
	const tracks = [createMockTrack()];
	const mockResponse = createMockResponse();
	const mockAnswer = createMockMessageComponentInteraction('unknown');

	vi.mocked(mockResponse.awaitMessageComponent).mockResolvedValue(mockAnswer);
	vi.mocked(interaction.editReply).mockResolvedValue(mockResponse);

	mockedUseQueue.mockReturnValue(null);
	mockedUseMainPlayer.mockReturnValue(mockPlayer);
	mockedQueueRecoveryService.getContents.mockResolvedValue({
		tracks,
		progress: EXAMPLE_PROGRESS,
	});

	await recoverCommandHandler(interaction);

	expect(interaction.editReply).toHaveBeenLastCalledWith({
		content: 'The queue will not be recovered.',
		components: [],
	});
	expect(mockedEnqueueTracks).not.toHaveBeenCalled();
});
