import { availableParallelism } from 'node:os';
import { useMainPlayer } from 'discord-player';
import type { EmbedBuilder, User, VoiceBasedChannel } from 'discord.js';
import Queue from 'p-queue';
import { beforeEach, expect, it, vi } from 'vitest';
import type { ProcessingInteraction } from '../../types/ProcessingInteraction';
import logger from '../logger';
import processTracksWithQueue from '../processTracksWithQueue';

const EXAMPLE_TRACKS = [
	'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
	'https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh',
	'Never Gonna Give You Up - Rick Astley',
];
const EXAMPLE_NODE_METADATA = { customData: 'test' };

vi.mock('node:os', () => ({
	availableParallelism: vi.fn(),
}));

vi.mock('discord-player');

vi.mock('p-queue', () => ({
	default: vi.fn(),
}));

const mockedAvailableParallelism = vi.mocked(availableParallelism);
const mockedUseMainPlayer = vi.mocked(useMainPlayer);
const mockedQueue = vi.mocked(Queue);
const mockedLogger = vi.mocked(logger);

beforeEach(() => {
	vi.clearAllMocks();
	mockedAvailableParallelism.mockReturnValue(4);
});

function createMockPlayer() {
	return {
		play: vi.fn().mockResolvedValue({ track: { title: 'Test Track' } }),
	} as unknown as ReturnType<typeof useMainPlayer>;
}

function createMockQueue(executeTasks = false) {
	return {
		on: vi.fn(),
		addAll: vi
			.fn()
			.mockImplementation(async (tasks: (() => Promise<unknown>)[]) => {
				if (executeTasks) {
					await Promise.all(tasks.map((task) => task()));
				}
			}),
		onIdle: vi.fn().mockResolvedValue(undefined),
		pending: 0,
	} as unknown as Queue;
}

function createMockInteraction() {
	return {
		editReply: vi.fn().mockResolvedValue(undefined),
		user: { id: 'user123' } as User,
		channel: null,
		reply: vi.fn(),
	} as ProcessingInteraction;
}

function createMockEmbed() {
	return {
		setDescription: vi.fn().mockReturnThis(),
	} as unknown as EmbedBuilder;
}

it('should process tracks successfully and return enqueued count', async () => {
	const mockPlayer = createMockPlayer();
	const mockQueue = createMockQueue(true);
	const mockEmbed = createMockEmbed();
	const mockInteraction = createMockInteraction();
	const mockVoiceChannel = {} as VoiceBasedChannel;

	mockedUseMainPlayer.mockReturnValue(mockPlayer);
	mockedQueue.mockReturnValue(mockQueue);

	const result = await processTracksWithQueue({
		items: EXAMPLE_TRACKS,
		voiceChannel: mockVoiceChannel,
		interaction: mockInteraction,
		embed: mockEmbed,
		nodeMetadata: EXAMPLE_NODE_METADATA,
	});

	expect(mockedQueue).toHaveBeenCalledWith({ concurrency: 4 });
	expect(mockQueue.on).toHaveBeenCalledWith('completed', expect.any(Function));
	expect(mockQueue.addAll).toHaveBeenCalledWith(
		expect.arrayContaining([expect.any(Function)]),
	);
	expect(mockQueue.onIdle).toHaveBeenCalled();
	expect(result).toEqual({ enqueued: 3 });
});

it('should handle player errors gracefully with custom `onError` handler', async () => {
	const mockError = new Error('Player failed');
	const mockPlayer = {
		play: vi.fn().mockRejectedValue(mockError),
	} as unknown as ReturnType<typeof useMainPlayer>;
	const mockQueue = createMockQueue(true);
	const mockEmbed = createMockEmbed();
	const mockInteraction = createMockInteraction();
	const mockVoiceChannel = {} as VoiceBasedChannel;
	const mockOnError = vi.fn();

	mockedUseMainPlayer.mockReturnValue(mockPlayer);
	mockedQueue.mockReturnValue(mockQueue);

	const result = await processTracksWithQueue({
		items: EXAMPLE_TRACKS,
		voiceChannel: mockVoiceChannel,
		interaction: mockInteraction,
		embed: mockEmbed,
		onError: mockOnError,
	});

	expect(mockOnError).toHaveBeenCalledTimes(3);
	expect(mockOnError).toHaveBeenCalledWith(mockError, 'Queue processing error');
	expect(result).toEqual({ enqueued: 0 });
});

it('should use default error handler when `onError` is not provided', async () => {
	const mockError = new Error('Player failed');
	const mockPlayer = {
		play: vi.fn().mockRejectedValue(mockError),
	} as unknown as ReturnType<typeof useMainPlayer>;
	const mockQueue = createMockQueue(true);
	const mockEmbed = createMockEmbed();
	const mockInteraction = createMockInteraction();
	const mockVoiceChannel = {} as VoiceBasedChannel;

	mockedUseMainPlayer.mockReturnValue(mockPlayer);
	mockedQueue.mockReturnValue(mockQueue);

	await processTracksWithQueue({
		items: ['test track'],
		voiceChannel: mockVoiceChannel,
		interaction: mockInteraction,
		embed: mockEmbed,
	});

	expect(mockedLogger.error).toHaveBeenCalledWith(
		mockError,
		'Queue processing error',
	);
});

it('should update progress when queue completes items', async () => {
	const mockPlayer = createMockPlayer();
	const mockQueue = createMockQueue();
	const mockEmbed = createMockEmbed();
	const mockInteraction = createMockInteraction();
	const mockVoiceChannel = {} as VoiceBasedChannel;

	mockedUseMainPlayer.mockReturnValue(mockPlayer);
	mockedQueue.mockReturnValue(mockQueue);

	await processTracksWithQueue({
		items: EXAMPLE_TRACKS,
		voiceChannel: mockVoiceChannel,
		interaction: mockInteraction,
		embed: mockEmbed,
	});

	expect(mockQueue.on).toHaveBeenCalledWith('completed', expect.any(Function));
});
