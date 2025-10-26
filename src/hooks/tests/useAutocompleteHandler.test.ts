import { captureException } from '@sentry/node';
import type { AutocompleteInteraction, Channel } from 'discord.js';
import { useMainPlayer, useQueue } from 'discord-player';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import determineSearchEngine from '../../utils/determineSearchEngine';
import getTrackPosition from '../../utils/getTrackPosition';
import logger from '../../utils/logger';
import truncateString from '../../utils/truncateString';
import useAutocompleteHandler from '../useAutocompleteHandler';

const EXAMPLE_TRACK_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const EXAMPLE_QUERY = 'never gonna give you up';
const EXAMPLE_TRACK_TITLE = 'Never Gonna Give You Up';
const EXAMPLE_TRACK_AUTHOR = 'Rick Astley';
const EXAMPLE_TRACK_DURATION = '3:32';

const mockedCaptureException = vi.mocked(captureException);
const mockedLogger = vi.mocked(logger);
const mockedUseMainPlayer = vi.mocked(useMainPlayer);
const mockedUseQueue = vi.mocked(useQueue);
const mockedDetermineSearchEngine = vi.mocked(determineSearchEngine);
const mockedGetTrackPosition = vi.mocked(getTrackPosition);

const mockGetEnvironmentVariable = vi.hoisted(() => vi.fn());
const mockGetAllPlaylists = vi.hoisted(() => vi.fn());

interface MockTextChannel {
	isTextBased: () => boolean;
}

vi.mock('@sentry/node');
vi.mock('discord-player');
vi.mock('../../utils/determineSearchEngine');
vi.mock('../../utils/getTrackPosition');
vi.mock('../../utils/getEnvironmentVariable', () => ({
	default: mockGetEnvironmentVariable,
}));
vi.mock('../../utils/getPlaylists', () => ({
	getAllPlaylists: mockGetAllPlaylists,
}));
vi.mock('p-debounce', () => ({
	default: <T extends (...args: unknown[]) => unknown>(fn: T) => fn, // Return the function immediately without debounce
}));

function createMockAutocompleteInteraction(
	commandName: string,
	query = '',
	responded = false,
	focusedOptionName?: string,
	playlistOptions: Record<string, string | null> = {},
) {
	const respond = vi.fn();

	return {
		isAutocomplete: () => true,
		responded,
		commandName,
		options: {
			getString: vi.fn((optionName: string) => {
				if (optionName === 'query') return query;
				if (focusedOptionName && optionName !== focusedOptionName) {
					return playlistOptions[optionName] || null;
				}
				return query;
			}),
			getFocused: vi.fn((returnObject?: boolean) => {
				if (returnObject) {
					return { name: focusedOptionName || 'query', value: query };
				}
				return query;
			}),
		},
		user: { id: 'user123' },
		client: {
			channels: {
				cache: {
					get: vi.fn(),
				},
			},
		},
		respond,
	} as unknown as AutocompleteInteraction;
}

interface MockTrack {
	title: string;
	author: string;
	url: string;
	duration: string;
}

function createMockTrack(
	title = EXAMPLE_TRACK_TITLE,
	author = EXAMPLE_TRACK_AUTHOR,
	url = EXAMPLE_TRACK_URL,
	duration = EXAMPLE_TRACK_DURATION,
): MockTrack {
	return {
		title,
		author,
		url,
		duration,
	};
}

function createMockSearchResult(tracks: MockTrack[] = []) {
	return {
		hasTracks: () => tracks.length > 0,
		tracks,
	};
}

function createMockQueue(
	tracks: MockTrack[] = [],
	currentTrack: MockTrack | null = null,
	isEmpty = false,
) {
	return {
		currentTrack,
		isEmpty: () => isEmpty,
		tracks: {
			toArray: () => tracks,
		},
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	mockedDetermineSearchEngine.mockReturnValue('youtubeSearch');
	mockedGetTrackPosition.mockReturnValue(0);
});

describe('guard clauses', () => {
	it('should return early if interaction is not autocomplete', async () => {
		const interaction = {
			isAutocomplete: () => false,
		} as unknown as AutocompleteInteraction;

		const result = await useAutocompleteHandler(interaction);

		expect(result).toBeUndefined();
	});

	it('should return early if interaction has already responded', async () => {
		const interaction = createMockAutocompleteInteraction(
			'play',
			EXAMPLE_QUERY,
			true,
		);

		const result = await useAutocompleteHandler(interaction);

		expect(result).toBeUndefined();
		expect(interaction.respond).not.toHaveBeenCalled();
	});
});

describe('play command autocomplete', () => {
	it('should handle empty query', async () => {
		const interaction = createMockAutocompleteInteraction('play', '');

		await useAutocompleteHandler(interaction);

		expect(interaction.respond).toHaveBeenCalledWith([]);
	});

	it('should handle valid search results', async () => {
		const mockTrack = createMockTrack();
		const mockSearchResult = createMockSearchResult([mockTrack]);
		const mockPlayer = {
			search: vi.fn().mockResolvedValue(mockSearchResult),
		};

		mockedUseMainPlayer.mockReturnValue(
			mockPlayer as unknown as ReturnType<typeof useMainPlayer>,
		);
		const interaction = createMockAutocompleteInteraction(
			'play',
			EXAMPLE_QUERY,
		);

		await useAutocompleteHandler(interaction);

		expect(mockPlayer.search).toHaveBeenCalledWith(EXAMPLE_QUERY, {
			searchEngine: 'youtubeSearch',
			fallbackSearchEngine: 'youtubeSearch',
			requestedBy: interaction.user,
		});

		expect(interaction.respond).toHaveBeenCalledWith([
			{
				name: `"${EXAMPLE_TRACK_TITLE}" by ${EXAMPLE_TRACK_AUTHOR} (${EXAMPLE_TRACK_DURATION})`,
				value: EXAMPLE_TRACK_URL,
			},
		]);
	});

	it('should filter tracks with URLs longer than 100 characters', async () => {
		const shortUrlTrack = createMockTrack(
			'Track 1',
			'Artist 1',
			'https://short.url',
		);
		const longUrlTrack = createMockTrack(
			'Track 2',
			'Artist 2',
			'https://very-long-url-that-exceeds-100-characters-and-should-be-filtered-out-from-the-results-because-it-is-too-long',
		);
		const mockSearchResult = createMockSearchResult([
			shortUrlTrack,
			longUrlTrack,
		]);
		const mockPlayer = {
			search: vi.fn().mockResolvedValue(mockSearchResult),
		};

		mockedUseMainPlayer.mockReturnValue(
			mockPlayer as unknown as ReturnType<typeof useMainPlayer>,
		);
		const interaction = createMockAutocompleteInteraction(
			'play',
			EXAMPLE_QUERY,
		);

		await useAutocompleteHandler(interaction);

		expect(interaction.respond).toHaveBeenCalledWith([
			{
				name: '"Track 1" by Artist 1 (3:32)',
				value: 'https://short.url',
			},
		]);
	});

	it('should limit results to 25 tracks', async () => {
		const tracks = Array.from({ length: 30 }, (_, i) =>
			createMockTrack(`Track ${i}`, `Artist ${i}`, `https://example.com/${i}`),
		);
		const mockSearchResult = createMockSearchResult(tracks);
		const mockPlayer = {
			search: vi.fn().mockResolvedValue(mockSearchResult),
		};

		mockedUseMainPlayer.mockReturnValue(
			mockPlayer as unknown as ReturnType<typeof useMainPlayer>,
		);
		const interaction = createMockAutocompleteInteraction(
			'play',
			EXAMPLE_QUERY,
		);

		await useAutocompleteHandler(interaction);

		expect(interaction.respond).toHaveBeenCalledWith(
			expect.arrayContaining([
				expect.objectContaining({
					name: expect.any(String),
					value: expect.any(String),
				}),
			]),
		);
		const respondCall = vi.mocked(interaction.respond).mock.calls[0]?.[0];
		expect(respondCall).toHaveLength(25);
	});

	it('should handle no search results', async () => {
		const mockSearchResult = createMockSearchResult([]);
		const mockPlayer = {
			search: vi.fn().mockResolvedValue(mockSearchResult),
		};

		mockedUseMainPlayer.mockReturnValue(
			mockPlayer as unknown as ReturnType<typeof useMainPlayer>,
		);
		const interaction = createMockAutocompleteInteraction(
			'play',
			EXAMPLE_QUERY,
		);

		await useAutocompleteHandler(interaction);

		expect(interaction.respond).toHaveBeenCalledWith([]);
	});

	it('should handle search errors', async () => {
		const mockError = new Error('Search failed');
		const mockPlayer = {
			search: vi.fn().mockRejectedValue(mockError),
		};

		mockedUseMainPlayer.mockReturnValue(
			mockPlayer as unknown as ReturnType<typeof useMainPlayer>,
		);
		const interaction = createMockAutocompleteInteraction(
			'play',
			EXAMPLE_QUERY,
		);

		await useAutocompleteHandler(interaction);

		expect(mockedLogger.error).toHaveBeenCalledWith(
			mockError,
			'Search autocomplete failed',
		);
		expect(mockedCaptureException).toHaveBeenCalledWith(mockError);
		expect(interaction.respond).toHaveBeenCalledWith([]);
	});

	it('should truncate long track titles and authors', async () => {
		const longTitle =
			'This is a very long track title that should be truncated';
		const longAuthor =
			'This is a very long artist name that should also be truncated';
		const mockTrack = createMockTrack(longTitle, longAuthor);
		const mockSearchResult = createMockSearchResult([mockTrack]);
		const mockPlayer = {
			search: vi.fn().mockResolvedValue(mockSearchResult),
		};

		mockedUseMainPlayer.mockReturnValue(
			mockPlayer as unknown as ReturnType<typeof useMainPlayer>,
		);
		const interaction = createMockAutocompleteInteraction(
			'play',
			EXAMPLE_QUERY,
		);

		await useAutocompleteHandler(interaction);

		expect(interaction.respond).toHaveBeenCalledWith([
			{
				name: `"${truncateString(longTitle, 40)}" by ${truncateString(longAuthor, 40)} (${EXAMPLE_TRACK_DURATION})`,
				value: EXAMPLE_TRACK_URL,
			},
		]);
	});
});

describe('remove command autocomplete', () => {
	it('should handle empty queue', async () => {
		const mockQueue = createMockQueue([], null, true);
		mockedUseQueue.mockReturnValue(
			mockQueue as unknown as ReturnType<typeof useQueue>,
		);

		const interaction = createMockAutocompleteInteraction(
			'remove',
			EXAMPLE_QUERY,
		);

		await useAutocompleteHandler(interaction);

		expect(interaction.respond).toHaveBeenCalledWith([]);
	});

	it('should handle no current track', async () => {
		const tracks = [createMockTrack()];
		const mockQueue = createMockQueue(tracks, null, false);
		mockedUseQueue.mockReturnValue(
			mockQueue as unknown as ReturnType<typeof useQueue>,
		);

		const interaction = createMockAutocompleteInteraction(
			'remove',
			EXAMPLE_QUERY,
		);

		await useAutocompleteHandler(interaction);

		expect(interaction.respond).toHaveBeenCalledWith([]);
	});

	it('should handle queue tracks', async () => {
		const currentTrack = createMockTrack('Current Song', 'Current Artist');
		const queueTrack = createMockTrack('Queue Song', 'Queue Artist');
		const mockQueue = createMockQueue([queueTrack], currentTrack, false);

		mockedUseQueue.mockReturnValue(
			mockQueue as unknown as ReturnType<typeof useQueue>,
		);
		mockedGetTrackPosition.mockReturnValue(1);

		const interaction = createMockAutocompleteInteraction('remove', '');

		await useAutocompleteHandler(interaction);

		expect(interaction.respond).toHaveBeenCalledWith([
			{
				name: '1. "Current Song" by Current Artist',
				value: '1',
			},
			{
				name: '3. "Queue Song" by Queue Artist',
				value: '3',
			},
		]);
	});

	it('should handle search query using Fuse.js', async () => {
		const currentTrack = createMockTrack(
			'Never Gonna Give You Up',
			'Rick Astley',
		);
		const queueTrack = createMockTrack('Bohemian Rhapsody', 'Queen');
		const mockQueue = createMockQueue([queueTrack], currentTrack, false);

		mockedUseQueue.mockReturnValue(
			mockQueue as unknown as ReturnType<typeof useQueue>,
		);
		mockedGetTrackPosition.mockReturnValue(1);

		const interaction = createMockAutocompleteInteraction('remove', 'rick');

		await useAutocompleteHandler(interaction);

		expect(interaction.respond).toHaveBeenCalledWith([
			{
				name: '1. "Never Gonna Give You Up" by Rick Astley',
				value: '1',
			},
		]);
	});
});

describe('move command autocomplete', () => {
	it('should handle same logic as `remove`', async () => {
		const currentTrack = createMockTrack();
		const mockQueue = createMockQueue([], currentTrack, false);

		mockedUseQueue.mockReturnValue(
			mockQueue as unknown as ReturnType<typeof useQueue>,
		);

		const interaction = createMockAutocompleteInteraction('move', '');

		await useAutocompleteHandler(interaction);

		expect(interaction.respond).toHaveBeenCalledWith([
			{
				name: '1. "Never Gonna Give You Up" by Rick Astley',
				value: '1',
			},
		]);
	});
});

describe('playlists command autocomplete', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetEnvironmentVariable.mockReturnValue('test-channel-id');
	});

	it('should return empty array if channel is not text-based', async () => {
		const interaction = createMockAutocompleteInteraction(
			'playlists',
			'',
			false,
			'playlist1',
		);

		const mockNonTextChannel: MockTextChannel = {
			isTextBased: vi.fn().mockReturnValue(false),
		};

		interaction.client.channels.cache.get = vi
			.fn()
			.mockReturnValue(mockNonTextChannel as Channel);

		await useAutocompleteHandler(interaction);

		expect(interaction.respond).toHaveBeenCalledWith([]);
		expect(mockNonTextChannel.isTextBased).toHaveBeenCalled();
		expect(interaction.client.channels.cache.get).toHaveBeenCalledWith(
			'test-channel-id',
		);
	});

	it('should return empty array when channel is not found', async () => {
		const interaction = createMockAutocompleteInteraction(
			'playlists',
			'',
			false,
			'playlist1',
		);

		interaction.client.channels.cache.get = vi.fn(
			() => undefined as Channel | undefined,
		);

		await useAutocompleteHandler(interaction);

		expect(interaction.respond).toHaveBeenCalledWith([]);
	});

	it('should filter out already selected playlists', async () => {
		const mockChannel: MockTextChannel = {
			isTextBased: vi.fn().mockReturnValue(true),
		};

		const interaction = createMockAutocompleteInteraction(
			'playlists',
			'',
			false,
			'playlist3',
			{
				playlist1: 'https://open.spotify.com/playlist/1?si=test1',
				playlist2: 'https://open.spotify.com/playlist/2?si=test2',
				playlist3: null,
			},
		);

		interaction.client.channels.cache.get = vi.fn(() => mockChannel as Channel);

		mockGetAllPlaylists.mockResolvedValue([
			{
				name: 'Playlist 1',
				value: 'https://open.spotify.com/playlist/1?si=test1',
			},
			{
				name: 'Playlist 2',
				value: 'https://open.spotify.com/playlist/2?si=test2',
			},
			{
				name: 'Playlist 3',
				value: 'https://open.spotify.com/playlist/3?si=test3',
			},
		]);

		await useAutocompleteHandler(interaction);

		expect(interaction.respond).toHaveBeenCalledWith([
			{
				name: 'Playlist 3',
				value: 'https://open.spotify.com/playlist/3?si=test3',
			},
		]);
	});

	it('should return all playlists when none are selected', async () => {
		const mockChannel: MockTextChannel = {
			isTextBased: vi.fn().mockReturnValue(true),
		};

		const interaction = createMockAutocompleteInteraction(
			'playlists',
			'',
			false,
			'playlist1',
			{
				playlist1: null,
				playlist2: null,
				playlist3: null,
				playlist4: null,
				playlist5: null,
			},
		);

		interaction.client.channels.cache.get = vi.fn(() => mockChannel as Channel);

		mockGetAllPlaylists.mockResolvedValue([
			{
				name: 'Playlist 1',
				value: 'https://open.spotify.com/playlist/1?si=test1',
			},
			{
				name: 'Playlist 2',
				value: 'https://open.spotify.com/playlist/2?si=test2',
			},
		]);

		await useAutocompleteHandler(interaction);

		expect(interaction.respond).toHaveBeenCalledWith([
			{
				name: 'Playlist 1',
				value: 'https://open.spotify.com/playlist/1?si=test1',
			},
			{
				name: 'Playlist 2',
				value: 'https://open.spotify.com/playlist/2?si=test2',
			},
		]);
	});

	it('should search playlists with fuzzy matching when query is provided', async () => {
		const mockChannel: MockTextChannel = {
			isTextBased: vi.fn().mockReturnValue(true),
		};

		const interaction = createMockAutocompleteInteraction(
			'playlists',
			'class',
			false,
			'playlist1',
			{},
		);

		interaction.client.channels.cache.get = vi.fn(() => mockChannel as Channel);

		mockGetAllPlaylists.mockResolvedValue([
			{
				name: 'Rock Classics',
				value: 'https://open.spotify.com/playlist/1?si=test1',
			},
			{
				name: 'Jazz Evening',
				value: 'https://open.spotify.com/playlist/2?si=test2',
			},
			{
				name: 'Classical Music',
				value: 'https://open.spotify.com/playlist/3?si=test3',
			},
		]);

		await useAutocompleteHandler(interaction);

		const respondCall = vi.mocked(interaction.respond).mock.calls[0]?.[0];
		expect(respondCall).toHaveLength(2);
		expect(respondCall).toContainEqual({
			name: 'Rock Classics',
			value: 'https://open.spotify.com/playlist/1?si=test1',
		});
		expect(respondCall).toContainEqual({
			name: 'Classical Music',
			value: 'https://open.spotify.com/playlist/3?si=test3',
		});
	});

	it('should handle playlist autocomplete errors', async () => {
		const mockChannel: MockTextChannel = {
			isTextBased: vi.fn().mockReturnValue(true),
		};

		const interaction = createMockAutocompleteInteraction(
			'playlists',
			'',
			false,
			'playlist1',
		);

		interaction.client.channels.cache.get = vi.fn(() => mockChannel as Channel);

		mockGetAllPlaylists.mockRejectedValue(
			new Error('Failed to fetch messages'),
		);

		await useAutocompleteHandler(interaction);

		expect(interaction.respond).toHaveBeenCalledWith([]);
	});
});

describe('head command autocomplete', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetEnvironmentVariable.mockReturnValue('test-channel-id');
	});

	it('should return all playlists without filtering', async () => {
		const mockChannel: MockTextChannel = {
			isTextBased: vi.fn().mockReturnValue(true),
		};

		const interaction = createMockAutocompleteInteraction(
			'head',
			'',
			false,
			'playlist',
		);

		interaction.client.channels.cache.get = vi.fn(() => mockChannel as Channel);

		mockGetAllPlaylists.mockResolvedValue([
			{
				name: 'Playlist 1',
				value: 'https://open.spotify.com/playlist/1?si=test1',
			},
			{
				name: 'Playlist 2',
				value: 'https://open.spotify.com/playlist/2?si=test2',
			},
		]);

		await useAutocompleteHandler(interaction);

		expect(interaction.respond).toHaveBeenCalledWith([
			{
				name: 'Playlist 1',
				value: 'https://open.spotify.com/playlist/1?si=test1',
			},
			{
				name: 'Playlist 2',
				value: 'https://open.spotify.com/playlist/2?si=test2',
			},
		]);
	});

	it('should support fuzzy search', async () => {
		const mockChannel: MockTextChannel = {
			isTextBased: vi.fn().mockReturnValue(true),
		};

		const interaction = createMockAutocompleteInteraction(
			'head',
			'rock',
			false,
			'playlist',
		);

		interaction.client.channels.cache.get = vi.fn(() => mockChannel as Channel);

		mockGetAllPlaylists.mockResolvedValue([
			{
				name: 'Rock Music',
				value: 'https://open.spotify.com/playlist/1?si=test1',
			},
			{
				name: 'Jazz Vibes',
				value: 'https://open.spotify.com/playlist/2?si=test2',
			},
		]);

		await useAutocompleteHandler(interaction);

		expect(interaction.respond).toHaveBeenCalledWith([
			{
				name: 'Rock Music',
				value: 'https://open.spotify.com/playlist/1?si=test1',
			},
		]);
	});
});

describe('tail command autocomplete', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetEnvironmentVariable.mockReturnValue('test-channel-id');
	});

	it('should return all playlists without filtering', async () => {
		const mockChannel: MockTextChannel = {
			isTextBased: vi.fn().mockReturnValue(true),
		};

		const interaction = createMockAutocompleteInteraction(
			'tail',
			'',
			false,
			'playlist',
		);

		interaction.client.channels.cache.get = vi.fn(() => mockChannel as Channel);

		mockGetAllPlaylists.mockResolvedValue([
			{
				name: 'Playlist 1',
				value: 'https://open.spotify.com/playlist/1?si=test1',
			},
			{
				name: 'Playlist 2',
				value: 'https://open.spotify.com/playlist/2?si=test2',
			},
		]);

		await useAutocompleteHandler(interaction);

		expect(interaction.respond).toHaveBeenCalledWith([
			{
				name: 'Playlist 1',
				value: 'https://open.spotify.com/playlist/1?si=test1',
			},
			{
				name: 'Playlist 2',
				value: 'https://open.spotify.com/playlist/2?si=test2',
			},
		]);
	});
});

describe('misc', () => {
	it('should handle unrecognized commands by not responding', async () => {
		const interaction = createMockAutocompleteInteraction(
			'unknown',
			EXAMPLE_QUERY,
		);

		const result = await useAutocompleteHandler(interaction);

		expect(result).toBeUndefined();
		expect(interaction.respond).not.toHaveBeenCalled();
	});
});
