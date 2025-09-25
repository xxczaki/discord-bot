import { captureException } from '@sentry/node';
import type { VoiceBasedChannel } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import type { GuildQueue, Player, Track } from 'discord-player';
import { useMainPlayer, useQueue } from 'discord-player';
import { beforeEach, expect, it, vi } from 'vitest';
import type { ProcessingInteraction } from '../../types/ProcessingInteraction';
import enqueueTracks from '../enqueueTracks';
import logger from '../logger';
import processTracksWithQueue from '../processTracksWithQueue';

const EXAMPLE_TRACK_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const EXAMPLE_TRACK_URL_2 =
	'https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh';
const EXAMPLE_TRACK_URL_3 = 'Never Gonna Give You Up - Rick Astley';

vi.mock('discord-player', () => ({
	useMainPlayer: vi.fn(),
	useQueue: vi.fn(),
}));

vi.mock('../processTracksWithQueue', () => ({
	default: vi.fn().mockResolvedValue({ enqueued: 0 }),
}));

vi.mock('@sentry/node');

const mockedUseMainPlayer = vi.mocked(useMainPlayer);
const mockedUseQueue = vi.mocked(useQueue);
const mockedProcessTracksWithQueue = vi.mocked(processTracksWithQueue);
const mockedLogger = vi.mocked(logger);
const mockedCaptureException = vi.mocked(captureException);

beforeEach(() => {
	vi.clearAllMocks();
});

function createMockTrack(url: string): Track {
	return {
		url,
		title: 'Test Track',
		author: 'Test Artist',
		duration: '3:45',
		id: `track-${url}`,
	} as Track;
}

function createMockPlayer(): Partial<Player> {
	return {
		play: vi.fn().mockResolvedValue({ track: createMockTrack('test') }),
	};
}

function createMockQueue(tracks: Track[] = []): Partial<GuildQueue> {
	return {
		tracks: {
			data: tracks,
			store: tracks,
		} as GuildQueue['tracks'],
	};
}

function createMockInteraction(): ProcessingInteraction {
	return {
		reply: vi.fn().mockResolvedValue(undefined),
		editReply: vi.fn().mockResolvedValue(undefined),
		user: { id: 'user123' },
	} as unknown as ProcessingInteraction;
}

function createMockVoiceChannel(): VoiceBasedChannel {
	return {} as VoiceBasedChannel;
}

it('should handle single track successfully', async () => {
	const tracks = [createMockTrack(EXAMPLE_TRACK_URL)];
	const mockPlayer = createMockPlayer();
	const mockQueue = createMockQueue();
	const mockInteraction = createMockInteraction();
	const mockVoiceChannel = createMockVoiceChannel();

	mockedUseMainPlayer.mockReturnValue(mockPlayer as Player);
	mockedUseQueue.mockReturnValue(mockQueue as GuildQueue);

	await enqueueTracks({
		tracks,
		progress: 0,
		voiceChannel: mockVoiceChannel,
		interaction: mockInteraction,
	});

	expect(mockInteraction.reply).toHaveBeenCalledWith({
		components: [],
		embeds: [expect.any(EmbedBuilder)],
	});

	expect(mockPlayer.play).toHaveBeenCalledWith(
		mockVoiceChannel,
		EXAMPLE_TRACK_URL,
		{
			searchEngine: 'youtubeVideo',
			nodeOptions: {
				metadata: { interaction: mockInteraction },
				defaultFFmpegFilters: ['_normalizer'],
			},
			audioPlayerOptions: {
				seek: 0,
			},
			requestedBy: mockInteraction.user,
		},
	);

	const mockEditReply = vi.mocked(mockInteraction.editReply);
	const lastEditCall =
		mockEditReply.mock.calls[mockEditReply.mock.calls.length - 1];
	const embed = lastEditCall?.[0]?.embeds?.[0] as EmbedBuilder;
	expect(embed.data.description).toBe(
		'1 track had been processed and added to the queue.\n0 skipped.',
	);
});

it('should handle play error for first track', async () => {
	const tracks = [createMockTrack(EXAMPLE_TRACK_URL)];
	const mockError = new Error('Play failed');
	const mockPlayer = {
		play: vi.fn().mockRejectedValue(mockError),
	} as Partial<Player>;
	const mockQueue = createMockQueue();
	const mockInteraction = createMockInteraction();
	const mockVoiceChannel = createMockVoiceChannel();

	mockedUseMainPlayer.mockReturnValue(mockPlayer as Player);
	mockedUseQueue.mockReturnValue(mockQueue as GuildQueue);

	await enqueueTracks({
		tracks,
		progress: 0,
		voiceChannel: mockVoiceChannel,
		interaction: mockInteraction,
	});

	expect(mockedLogger.error).toHaveBeenCalledWith(
		mockError,
		'Queue recovery error (first track)',
	);
	expect(mockedCaptureException).toHaveBeenCalledWith(mockError);
});

it('should handle queue not existing', async () => {
	const tracks = [createMockTrack(EXAMPLE_TRACK_URL)];
	const mockPlayer = createMockPlayer();
	const mockInteraction = createMockInteraction();
	const mockVoiceChannel = createMockVoiceChannel();

	mockedUseMainPlayer.mockReturnValue(mockPlayer as Player);
	mockedUseQueue.mockReturnValue(null);

	await enqueueTracks({
		tracks,
		progress: 0,
		voiceChannel: mockVoiceChannel,
		interaction: mockInteraction,
	});

	expect(mockInteraction.editReply).toHaveBeenCalledWith({
		content: 'The queue is empty.',
		embeds: [],
	});
});

it('should handle multiple tracks successfully', async () => {
	const tracks = [
		createMockTrack(EXAMPLE_TRACK_URL),
		createMockTrack(EXAMPLE_TRACK_URL_2),
		createMockTrack(EXAMPLE_TRACK_URL_3),
	];
	const mockPlayer = createMockPlayer();
	const mockQueue = createMockQueue([
		createMockTrack(EXAMPLE_TRACK_URL),
		createMockTrack(EXAMPLE_TRACK_URL_2),
		createMockTrack(EXAMPLE_TRACK_URL_3),
	]);
	const mockInteraction = createMockInteraction();
	const mockVoiceChannel = createMockVoiceChannel();

	mockedUseMainPlayer.mockReturnValue(mockPlayer as Player);
	mockedUseQueue.mockReturnValue(mockQueue as GuildQueue);
	mockedProcessTracksWithQueue.mockResolvedValue({ enqueued: 2 });

	await enqueueTracks({
		tracks,
		progress: 0,
		voiceChannel: mockVoiceChannel,
		interaction: mockInteraction,
	});

	expect(mockPlayer.play).toHaveBeenCalledWith(
		mockVoiceChannel,
		EXAMPLE_TRACK_URL,
		expect.any(Object),
	);

	expect(mockedProcessTracksWithQueue).toHaveBeenCalledWith({
		items: [EXAMPLE_TRACK_URL_2, EXAMPLE_TRACK_URL_3],
		voiceChannel: mockVoiceChannel,
		interaction: mockInteraction,
		embed: expect.any(EmbedBuilder),
		onError: expect.any(Function),
	});

	if (mockQueue?.tracks) {
		expect(mockQueue.tracks.store).toEqual([
			createMockTrack(EXAMPLE_TRACK_URL),
			createMockTrack(EXAMPLE_TRACK_URL_2),
			createMockTrack(EXAMPLE_TRACK_URL_3),
		]);
	}

	const mockEditReply = vi.mocked(mockInteraction.editReply);
	const lastEditCall =
		mockEditReply.mock.calls[mockEditReply.mock.calls.length - 1];
	const embed = lastEditCall?.[0]?.embeds?.[0] as EmbedBuilder;
	expect(embed.data.description).toBe(
		'3 tracks had been processed and added to the queue.\n0 skipped.',
	);
});

it('should handle `processTracksWithQueue` errors', async () => {
	const tracks = [
		createMockTrack(EXAMPLE_TRACK_URL),
		createMockTrack(EXAMPLE_TRACK_URL_2),
	];
	const mockPlayer = createMockPlayer();
	const mockQueue = createMockQueue();
	const mockInteraction = createMockInteraction();
	const mockVoiceChannel = createMockVoiceChannel();

	mockedUseMainPlayer.mockReturnValue(mockPlayer as Player);
	mockedUseQueue.mockReturnValue(mockQueue as GuildQueue);
	mockedProcessTracksWithQueue.mockResolvedValue({ enqueued: 0 });

	await enqueueTracks({
		tracks,
		progress: 0,
		voiceChannel: mockVoiceChannel,
		interaction: mockInteraction,
	});

	// Verify the onError callback works
	const processCall = mockedProcessTracksWithQueue.mock.calls[0]?.[0];
	const onErrorCallback = processCall?.onError;

	if (onErrorCallback) {
		const testError = new Error('Test error');
		onErrorCallback(testError, 'test context');

		expect(mockedLogger.error).toHaveBeenCalledWith(
			testError,
			'Queue recovery error (subsequent tracks)',
		);
		expect(mockedCaptureException).toHaveBeenCalledWith(testError);
	}
});

it('should handle queue not existing after processing multiple tracks', async () => {
	const tracks = [
		createMockTrack(EXAMPLE_TRACK_URL),
		createMockTrack(EXAMPLE_TRACK_URL_2),
	];
	const mockPlayer = createMockPlayer();
	const mockInteraction = createMockInteraction();
	const mockVoiceChannel = createMockVoiceChannel();

	mockedUseMainPlayer.mockReturnValue(mockPlayer as Player);
	mockedUseQueue.mockReturnValue(null);
	mockedProcessTracksWithQueue.mockResolvedValue({ enqueued: 1 });

	await enqueueTracks({
		tracks,
		progress: 0,
		voiceChannel: mockVoiceChannel,
		interaction: mockInteraction,
	});

	expect(mockInteraction.editReply).toHaveBeenCalledWith({
		content: 'The queue is empty.',
		embeds: [],
	});
});
