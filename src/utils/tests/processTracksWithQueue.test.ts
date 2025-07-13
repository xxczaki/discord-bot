import { availableParallelism } from 'node:os';
import type { EmbedBuilder, User, VoiceBasedChannel } from 'discord.js';
import type { GuildQueue, Player } from 'discord-player';
import { useMainPlayer, useQueue } from 'discord-player';
import Queue from 'p-queue';
import { beforeEach, expect, it, vi } from 'vitest';
import type { ProcessingInteraction } from '../../types/ProcessingInteraction';
import processTracksWithQueue from '../processTracksWithQueue';

const EXAMPLE_TRACKS = [
	'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
	'https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh',
	'Never Gonna Give You Up - Rick Astley',
];

vi.mock('node:os', () => ({
	availableParallelism: vi.fn(),
}));

vi.mock('discord-player', () => ({
	useMainPlayer: vi.fn(),
	useQueue: vi.fn(),
}));

vi.mock('p-queue', () => ({
	default: vi.fn(),
}));

const mockedAvailableParallelism = vi.mocked(availableParallelism);
const mockedUseMainPlayer = vi.mocked(useMainPlayer);
const mockedUseQueue = vi.mocked(useQueue);
const mockedQueue = vi.mocked(Queue);

beforeEach(() => {
	vi.clearAllMocks();
	mockedAvailableParallelism.mockReturnValue(4);
});

function createMockInteraction(): ProcessingInteraction {
	return {
		editReply: vi.fn().mockResolvedValue(undefined),
		user: { id: 'user123' } as User,
		channel: {
			id: 'channel123',
		} as unknown as ProcessingInteraction['channel'],
		reply: vi.fn().mockResolvedValue(undefined),
	} as ProcessingInteraction;
}

function createMockEmbed(): EmbedBuilder {
	return {
		setDescription: vi.fn().mockReturnThis(),
	} as unknown as EmbedBuilder;
}

function createMockPlayer(): Partial<Player> {
	return {
		play: vi.fn().mockResolvedValue({ track: { title: 'Test Track' } }),
		search: vi.fn().mockResolvedValue({
			hasTracks: () => true,
			tracks: [{ title: 'Test Track', id: 'test-id' }],
		}),
	};
}

function createMockGuildQueue(): Partial<GuildQueue> {
	return {
		addTrack: vi.fn(),
		tracks: {
			data: [],
			size: 0,
			first: vi.fn(),
			at: vi.fn(),
			toArray: vi.fn().mockReturnValue([]),
		} as unknown as GuildQueue['tracks'],
	};
}

function createMockQueueInstance(): Partial<Queue> {
	return {
		on: vi.fn(),
		addAll: vi.fn().mockResolvedValue(undefined),
		onIdle: vi.fn().mockResolvedValue(undefined),
		pending: 0,
	};
}

it('should use conservative concurrency limits', async () => {
	const mockPlayer = createMockPlayer();
	const mockGuildQueue = createMockGuildQueue();
	const mockQueueInstance = createMockQueueInstance();

	mockedAvailableParallelism.mockReturnValue(16);
	mockedUseMainPlayer.mockReturnValue(mockPlayer as Player);
	mockedUseQueue.mockReturnValue(mockGuildQueue as unknown as GuildQueue);
	mockedQueue.mockReturnValue(mockQueueInstance as Queue);

	await processTracksWithQueue({
		items: EXAMPLE_TRACKS,
		voiceChannel: {} as VoiceBasedChannel,
		interaction: createMockInteraction(),
		embed: createMockEmbed(),
	});

	expect(mockedQueue).toHaveBeenCalledWith({ concurrency: 3 });
});

it('should return enqueued count for small track lists', async () => {
	const mockPlayer = createMockPlayer();
	const mockGuildQueue = createMockGuildQueue();
	const mockQueueInstance = {
		on: vi.fn(),
		addAll: vi
			.fn()
			.mockImplementation(async (tasks: (() => Promise<unknown>)[]) => {
				await Promise.all(tasks.map((task) => task()));
			}),
		onIdle: vi.fn().mockResolvedValue(undefined),
		pending: 0,
	} as Partial<Queue>;

	mockedUseMainPlayer.mockReturnValue(mockPlayer as Player);
	mockedUseQueue.mockReturnValue(mockGuildQueue as unknown as GuildQueue);
	mockedQueue.mockReturnValue(mockQueueInstance as Queue);

	const result = await processTracksWithQueue({
		items: EXAMPLE_TRACKS,
		voiceChannel: {} as VoiceBasedChannel,
		interaction: createMockInteraction(),
		embed: createMockEmbed(),
	});

	expect(result).toEqual({ enqueued: 3 });
});

it('should handle errors gracefully with custom `onError` handler', async () => {
	const mockError = new Error('Player failed');
	const mockPlayer = {
		play: vi.fn().mockRejectedValue(mockError),
		search: vi.fn().mockRejectedValue(mockError),
	} as Partial<Player>;
	const mockGuildQueue = createMockGuildQueue();
	const mockQueueInstance = {
		on: vi.fn(),
		addAll: vi
			.fn()
			.mockImplementation(async (tasks: (() => Promise<unknown>)[]) => {
				await Promise.all(tasks.map((task) => task()));
			}),
		onIdle: vi.fn().mockResolvedValue(undefined),
		pending: 0,
	} as Partial<Queue>;
	const mockOnError = vi.fn();

	mockedUseMainPlayer.mockReturnValue(mockPlayer as Player);
	mockedUseQueue.mockReturnValue(mockGuildQueue as unknown as GuildQueue);
	mockedQueue.mockReturnValue(mockQueueInstance as Queue);

	const result = await processTracksWithQueue({
		items: EXAMPLE_TRACKS,
		voiceChannel: {} as VoiceBasedChannel,
		interaction: createMockInteraction(),
		embed: createMockEmbed(),
		onError: mockOnError,
	});

	expect(mockOnError).toHaveBeenCalledTimes(3);
	expect(mockOnError).toHaveBeenCalledWith(mockError, 'Queue processing error');
	expect(result).toEqual({ enqueued: 0 });
});

it('should use batch processing for large track lists', async () => {
	const largeTrackList = Array.from({ length: 15 }, (_, i) => `track-${i}`);
	const mockPlayer = createMockPlayer();
	const mockGuildQueue = createMockGuildQueue();
	const mockQueueInstance = {
		on: vi.fn(),
		addAll: vi
			.fn()
			.mockImplementation(async (tasks: (() => Promise<unknown>)[]) => {
				await Promise.all(tasks.map((task) => task()));
			}),
		onIdle: vi.fn().mockResolvedValue(undefined),
		pending: 0,
	} as Partial<Queue>;

	mockedUseMainPlayer.mockReturnValue(mockPlayer as Player);
	mockedUseQueue.mockReturnValue(mockGuildQueue as unknown as GuildQueue);
	mockedQueue.mockReturnValue(mockQueueInstance as Queue);

	const result = await processTracksWithQueue({
		items: largeTrackList,
		voiceChannel: {} as VoiceBasedChannel,
		interaction: createMockInteraction(),
		embed: createMockEmbed(),
	});

	expect(mockPlayer.play).toHaveBeenCalled();
	expect(result).toEqual({ enqueued: 15 });
});

it('should handle failed play attempts for large batches', async () => {
	const largeTrackList = Array.from({ length: 15 }, (_, i) => `track-${i}`);
	const mockPlayer = {
		play: vi.fn().mockRejectedValue(new Error('Play failed')),
	} as Partial<Player>;
	const mockGuildQueue = createMockGuildQueue();
	const mockQueueInstance = {
		on: vi.fn(),
		addAll: vi
			.fn()
			.mockImplementation(async (tasks: (() => Promise<unknown>)[]) => {
				await Promise.all(tasks.map((task) => task()));
			}),
		onIdle: vi.fn().mockResolvedValue(undefined),
		pending: 0,
	} as Partial<Queue>;

	mockedUseMainPlayer.mockReturnValue(mockPlayer as Player);
	mockedUseQueue.mockReturnValue(mockGuildQueue as unknown as GuildQueue);
	mockedQueue.mockReturnValue(mockQueueInstance as Queue);

	const result = await processTracksWithQueue({
		items: largeTrackList,
		voiceChannel: {} as VoiceBasedChannel,
		interaction: createMockInteraction(),
		embed: createMockEmbed(),
	});

	expect(result).toEqual({ enqueued: 0 });
});

it('should store queries in track metadata when provided', async () => {
	const mockSetMetadata = vi.fn();
	const mockTrack = {
		id: 'track-123',
		title: 'Test Track',
		setMetadata: mockSetMetadata,
		metadata: { existingData: true },
	};
	const mockPlayer = {
		play: vi.fn().mockResolvedValue({ track: mockTrack }),
	} as Partial<Player>;
	const mockGuildQueue = createMockGuildQueue();
	const mockQueueInstance = {
		on: vi.fn(),
		addAll: vi
			.fn()
			.mockImplementation(async (tasks: (() => Promise<unknown>)[]) => {
				await Promise.all(tasks.map((task) => task()));
			}),
		onIdle: vi.fn().mockResolvedValue(undefined),
		pending: 0,
	} as Partial<Queue>;

	mockedUseMainPlayer.mockReturnValue(mockPlayer as Player);
	mockedUseQueue.mockReturnValue(mockGuildQueue as unknown as GuildQueue);
	mockedQueue.mockReturnValue(mockQueueInstance as Queue);

	await processTracksWithQueue({
		items: ['test query'],
		voiceChannel: {} as VoiceBasedChannel,
		interaction: createMockInteraction(),
		embed: createMockEmbed(),
		nodeMetadata: { queries: { '0': 'test query' } },
	});

	expect(mockSetMetadata).toHaveBeenCalledWith({
		existingData: true,
		originalQuery: 'test query',
	});
});
