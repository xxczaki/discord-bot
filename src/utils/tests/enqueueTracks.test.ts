import { captureException } from '@sentry/node';
import type { Track } from 'discord-player';
import { useMainPlayer, useQueue } from 'discord-player';
import { EmbedBuilder } from 'discord.js';
import type { VoiceBasedChannel } from 'discord.js';
import { beforeEach, expect, it, vi } from 'vitest';
import type { ProcessingInteraction } from '../../types/ProcessingInteraction';
import determineSearchEngine from '../determineSearchEngine';
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

vi.mock('../determineSearchEngine', () => ({
	default: vi.fn(),
}));

vi.mock('../processTracksWithQueue', () => ({
	default: vi.fn(),
}));

const mockedCaptureException = vi.mocked(captureException);
const mockedUseMainPlayer = vi.mocked(useMainPlayer);
const mockedUseQueue = vi.mocked(useQueue);
const mockedDetermineSearchEngine = vi.mocked(determineSearchEngine);
const mockedProcessTracksWithQueue = vi.mocked(processTracksWithQueue);
const mockedLogger = vi.mocked(logger);

beforeEach(() => {
	vi.clearAllMocks();
	mockedDetermineSearchEngine.mockReturnValue('youtube');
});

function createMockTrack(url: string): Track {
	return {
		url,
		title: 'Test Track',
		author: 'Test Author',
		duration: '3:30',
	} as Track;
}

function createMockPlayer() {
	return {
		play: vi.fn().mockResolvedValue({}),
	} as unknown as ReturnType<typeof useMainPlayer>;
}

function createMockQueue(tracks: Track[] = []) {
	return {
		tracks: {
			data: [...tracks],
			store: tracks,
		},
	} as unknown as ReturnType<typeof useQueue>;
}

function createMockInteraction() {
	return {
		user: { id: 'user123' },
		reply: vi.fn().mockResolvedValue({}),
		editReply: vi.fn().mockResolvedValue({}),
	} as unknown as ProcessingInteraction;
}

function createMockVoiceChannel() {
	return {
		id: 'channel123',
		name: 'Test Channel',
	} as VoiceBasedChannel;
}

it('should handle single track successfully', async () => {
	const tracks = [createMockTrack(EXAMPLE_TRACK_URL)];
	const mockPlayer = createMockPlayer();
	const mockQueue = createMockQueue();
	const mockInteraction = createMockInteraction();
	const mockVoiceChannel = createMockVoiceChannel();

	mockedUseMainPlayer.mockReturnValue(mockPlayer);
	mockedUseQueue.mockReturnValue(mockQueue);

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
			searchEngine: 'youtube',
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

it('should handle single track with progress', async () => {
	const tracks = [createMockTrack(EXAMPLE_TRACK_URL)];
	const mockPlayer = createMockPlayer();
	const mockQueue = createMockQueue();
	const mockInteraction = createMockInteraction();
	const mockVoiceChannel = createMockVoiceChannel();

	mockedUseMainPlayer.mockReturnValue(mockPlayer);
	mockedUseQueue.mockReturnValue(mockQueue);

	await enqueueTracks({
		tracks,
		progress: 30000,
		voiceChannel: mockVoiceChannel,
		interaction: mockInteraction,
	});

	expect(mockPlayer.play).toHaveBeenCalledWith(
		mockVoiceChannel,
		EXAMPLE_TRACK_URL,
		expect.objectContaining({
			audioPlayerOptions: {
				seek: 30000,
			},
		}),
	);
});

it('should handle single track when queue is empty after playing', async () => {
	const tracks = [createMockTrack(EXAMPLE_TRACK_URL)];
	const mockPlayer = createMockPlayer();
	const mockInteraction = createMockInteraction();
	const mockVoiceChannel = createMockVoiceChannel();

	mockedUseMainPlayer.mockReturnValue(mockPlayer);
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

	mockedUseMainPlayer.mockReturnValue(mockPlayer);
	mockedUseQueue.mockReturnValue(mockQueue);
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

	if (mockQueue) {
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

it('should handle multiple tracks when queue is empty after processing', async () => {
	const tracks = [
		createMockTrack(EXAMPLE_TRACK_URL),
		createMockTrack(EXAMPLE_TRACK_URL_2),
	];
	const mockPlayer = createMockPlayer();
	const mockInteraction = createMockInteraction();
	const mockVoiceChannel = createMockVoiceChannel();

	mockedUseMainPlayer.mockReturnValue(mockPlayer);
	mockedUseQueue.mockReturnValueOnce(null).mockReturnValueOnce(null);
	mockedProcessTracksWithQueue.mockResolvedValue({ enqueued: 1 });

	await enqueueTracks({
		tracks,
		progress: 0,
		voiceChannel: mockVoiceChannel,
		interaction: mockInteraction,
	});

	expect(mockInteraction.editReply).toHaveBeenLastCalledWith({
		content: 'The queue is empty.',
		embeds: [],
	});
});

it('should handle errors during first track play', async () => {
	const tracks = [createMockTrack(EXAMPLE_TRACK_URL)];
	const mockPlayer = createMockPlayer();
	const mockQueue = createMockQueue();
	const mockInteraction = createMockInteraction();
	const mockVoiceChannel = createMockVoiceChannel();
	const playError = new Error('Play failed');

	vi.mocked(mockPlayer.play).mockRejectedValue(playError);
	mockedUseMainPlayer.mockReturnValue(mockPlayer);
	mockedUseQueue.mockReturnValue(mockQueue);

	await enqueueTracks({
		tracks,
		progress: 0,
		voiceChannel: mockVoiceChannel,
		interaction: mockInteraction,
	});

	expect(mockedLogger.error).toHaveBeenCalledWith(
		playError,
		'Queue recovery error (first track)',
	);
	expect(mockedCaptureException).toHaveBeenCalledWith(playError);
});

it('should pass error handler to `processTracksWithQueue` that logs and captures errors', async () => {
	const tracks = [
		createMockTrack(EXAMPLE_TRACK_URL),
		createMockTrack(EXAMPLE_TRACK_URL_2),
	];
	const mockPlayer = createMockPlayer();
	const mockQueue = createMockQueue([createMockTrack(EXAMPLE_TRACK_URL)]);
	const mockInteraction = createMockInteraction();
	const mockVoiceChannel = createMockVoiceChannel();
	const processError = new Error('Process failed');

	mockedUseMainPlayer.mockReturnValue(mockPlayer);
	mockedUseQueue.mockReturnValue(mockQueue);
	mockedProcessTracksWithQueue.mockResolvedValue({ enqueued: 0 });

	await enqueueTracks({
		tracks,
		progress: 0,
		voiceChannel: mockVoiceChannel,
		interaction: mockInteraction,
	});

	const onErrorCallback =
		mockedProcessTracksWithQueue.mock.calls[0]?.[0]?.onError;
	if (onErrorCallback) {
		onErrorCallback(processError, 'test context');

		expect(mockedLogger.error).toHaveBeenCalledWith(
			processError,
			'Queue recovery error (subsequent tracks)',
		);
		expect(mockedCaptureException).toHaveBeenCalledWith(processError);
	}
});

it('should sort tracks in the queue according to original order', async () => {
	const track1 = createMockTrack(EXAMPLE_TRACK_URL);
	const track2 = createMockTrack(EXAMPLE_TRACK_URL_2);
	const track3 = createMockTrack(EXAMPLE_TRACK_URL_3);
	const tracks = [track1, track2, track3];

	// Queue has tracks in different order
	const queueTracks = [track3, track1, track2];
	const mockQueue = createMockQueue(queueTracks);
	const mockPlayer = createMockPlayer();
	const mockInteraction = createMockInteraction();
	const mockVoiceChannel = createMockVoiceChannel();

	mockedUseMainPlayer.mockReturnValue(mockPlayer);
	mockedUseQueue.mockReturnValue(mockQueue);
	mockedProcessTracksWithQueue.mockResolvedValue({ enqueued: 2 });

	await enqueueTracks({
		tracks,
		progress: 0,
		voiceChannel: mockVoiceChannel,
		interaction: mockInteraction,
	});

	// Tracks should be sorted according to original order
	if (mockQueue) {
		expect(mockQueue.tracks.store).toEqual([track1, track2, track3]);
	}
});

it('should handle tracks not found in original array during sorting', async () => {
	const track1 = createMockTrack(EXAMPLE_TRACK_URL);
	const track2 = createMockTrack(EXAMPLE_TRACK_URL_2);
	const extraTrack = createMockTrack('https://example.com/extra');
	const tracks = [track1, track2];

	// Queue has an extra track not in original array
	const queueTracks = [extraTrack, track2, track1];
	const mockQueue = createMockQueue(queueTracks);
	const mockPlayer = createMockPlayer();
	const mockInteraction = createMockInteraction();
	const mockVoiceChannel = createMockVoiceChannel();

	mockedUseMainPlayer.mockReturnValue(mockPlayer);
	mockedUseQueue.mockReturnValue(mockQueue);
	mockedProcessTracksWithQueue.mockResolvedValue({ enqueued: 1 });

	await enqueueTracks({
		tracks,
		progress: 0,
		voiceChannel: mockVoiceChannel,
		interaction: mockInteraction,
	});

	// Extra track should be at the end, original tracks in order
	if (mockQueue) {
		expect(mockQueue.tracks.store).toEqual([track1, track2, extraTrack]);
	}
});
