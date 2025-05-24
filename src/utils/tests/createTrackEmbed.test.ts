import type { GuildQueue, Track } from 'discord-player';
import { EmbedBuilder } from 'discord.js';
import { beforeEach, expect, it, vi } from 'vitest';
import createTrackEmbed from '../createTrackEmbed';

const EXAMPLE_TRACK_ID = 'track-123';
const EXAMPLE_TRACK_TITLE = 'Test Song';
const EXAMPLE_TRACK_AUTHOR = 'Test Artist';
const EXAMPLE_TRACK_DURATION = '3:45';
const EXAMPLE_TRACK_URL = 'https://example.com/track';
const EXAMPLE_DESCRIPTION = 'Now playing';
const EXAMPLE_QUERY = 'test song artist';
const EXAMPLE_URL_QUERY = 'https://spotify.com/track/123';
const EXAMPLE_BRIDGE_URL = 'https://youtube.com/watch?v=123';

vi.mock('discord-player', () => ({
	serialize: vi.fn(() => 'serialized-track'),
}));

vi.mock('../getTrackThumbnail', () => ({
	default: vi.fn(() => 'https://example.com/thumbnail.jpg'),
}));

vi.mock('memoize', () => ({
	default: vi.fn((fn) => fn),
}));

const createMockTrack = (overrides: Partial<Track> = {}): Track =>
	({
		id: EXAMPLE_TRACK_ID,
		title: EXAMPLE_TRACK_TITLE,
		author: EXAMPLE_TRACK_AUTHOR,
		duration: EXAMPLE_TRACK_DURATION,
		url: EXAMPLE_TRACK_URL,
		thumbnail: 'https://example.com/thumb.jpg',
		metadata: {},
		...overrides,
	}) as Track;

const createMockQueue = (overrides: Partial<GuildQueue> = {}): GuildQueue =>
	({
		metadata: {},
		setMetadata: vi.fn(),
		...overrides,
	}) as unknown as GuildQueue;

beforeEach(() => {
	vi.clearAllMocks();
});

it('should create basic embed with required fields', () => {
	const track = createMockTrack();
	const queue = createMockQueue();

	const result = createTrackEmbed(queue, track, EXAMPLE_DESCRIPTION);

	expect(result).toBeInstanceOf(EmbedBuilder);
	expect(result.data.title).toBe(EXAMPLE_TRACK_TITLE);
	expect(result.data.description).toBe(EXAMPLE_DESCRIPTION);
	expect(result.data.url).toBe(EXAMPLE_TRACK_URL);
	expect(result.data.author?.name).toBe(EXAMPLE_TRACK_AUTHOR);
	expect(result.data.fields).toEqual([
		{ name: 'Duration', value: EXAMPLE_TRACK_DURATION, inline: true },
	]);
});

it('should add query field when query is not a URL', () => {
	const track = createMockTrack();
	const queue = createMockQueue({
		metadata: {
			queries: {
				[EXAMPLE_TRACK_ID]: EXAMPLE_QUERY,
			},
		},
	});

	const result = createTrackEmbed(queue, track, EXAMPLE_DESCRIPTION);

	expect(result.data.fields).toContainEqual({
		name: 'Query',
		value: `\`${EXAMPLE_QUERY}\``,
	});
});

it('should not add query field when query is a URL', () => {
	const track = createMockTrack();
	const queue = createMockQueue({
		metadata: {
			queries: {
				[EXAMPLE_TRACK_ID]: EXAMPLE_URL_QUERY,
			},
		},
	});

	const result = createTrackEmbed(queue, track, EXAMPLE_DESCRIPTION);

	const queryField = result.data.fields?.find(
		(field) => field.name === 'Query',
	);
	expect(queryField).toBeUndefined();
});

it('should use fallback query when track-specific query is not found', () => {
	const track = createMockTrack();
	const queue = createMockQueue({
		metadata: {
			queries: {
				'0': EXAMPLE_QUERY,
			},
		},
	});

	const result = createTrackEmbed(queue, track, EXAMPLE_DESCRIPTION);

	expect(result.data.fields).toContainEqual({
		name: 'Query',
		value: `\`${EXAMPLE_QUERY}\``,
	});
});

it('should clean up queries after use', () => {
	const track = createMockTrack();
	const mockSetMetadata = vi.fn();
	const queue = createMockQueue({
		metadata: {
			queries: {
				[EXAMPLE_TRACK_ID]: EXAMPLE_QUERY,
				'other-track': 'other query',
				'0': 'fallback query',
			},
		},
		setMetadata: mockSetMetadata,
	});

	createTrackEmbed(queue, track, EXAMPLE_DESCRIPTION);

	expect(mockSetMetadata).toHaveBeenCalledWith({
		queries: {
			'other-track': 'other query',
		},
	});
});

it('should not clean up queries when metadata.queries is undefined', () => {
	const track = createMockTrack();
	const mockSetMetadata = vi.fn();
	const queue = createMockQueue({
		metadata: {},
		setMetadata: mockSetMetadata,
	});

	createTrackEmbed(queue, track, EXAMPLE_DESCRIPTION);

	expect(mockSetMetadata).not.toHaveBeenCalled();
});

it('should return embed when track metadata is not an object', () => {
	const track = createMockTrack({ metadata: null });
	const queue = createMockQueue();

	const result = createTrackEmbed(queue, track, EXAMPLE_DESCRIPTION);

	expect(result).toBeInstanceOf(EmbedBuilder);
	expect(result.data.footer).toBeUndefined();
});

it('should add cache footer when track `isFromCache`', () => {
	const track = createMockTrack({
		metadata: {
			isFromCache: true,
		},
	});
	const queue = createMockQueue();

	const result = createTrackEmbed(queue, track, EXAMPLE_DESCRIPTION);

	expect(result.data.footer).toEqual({
		text: '♻️ Streaming from an offline cache',
	});
});

it('should add bridged URL field when bridge metadata exists', () => {
	const track = createMockTrack({
		metadata: {
			bridge: {
				url: EXAMPLE_BRIDGE_URL,
			},
		},
	});
	const queue = createMockQueue();

	const result = createTrackEmbed(queue, track, EXAMPLE_DESCRIPTION);

	expect(result.data.fields).toContainEqual({
		name: 'Bridged URL',
		value: `[YouTube](${EXAMPLE_BRIDGE_URL})`,
		inline: true,
	});
});

it('should not add bridged URL field when bridge metadata is not an object', () => {
	const track = createMockTrack({
		metadata: {
			bridge: null,
		},
	});
	const queue = createMockQueue();

	const result = createTrackEmbed(queue, track, EXAMPLE_DESCRIPTION);

	const bridgeField = result.data.fields?.find(
		(field) => field.name === 'Bridged URL',
	);
	expect(bridgeField).toBeUndefined();
});

it('should not add bridged URL field when bridge URL is missing', () => {
	const track = createMockTrack({
		metadata: {
			bridge: {},
		},
	});
	const queue = createMockQueue();

	const result = createTrackEmbed(queue, track, EXAMPLE_DESCRIPTION);

	const bridgeField = result.data.fields?.find(
		(field) => field.name === 'Bridged URL',
	);
	expect(bridgeField).toBeUndefined();
});

it('should handle both cache footer and bridged URL together', () => {
	const track = createMockTrack({
		metadata: {
			isFromCache: true,
			bridge: {
				url: EXAMPLE_BRIDGE_URL,
			},
		},
	});
	const queue = createMockQueue();

	const result = createTrackEmbed(queue, track, EXAMPLE_DESCRIPTION);

	expect(result.data.footer).toEqual({
		text: '♻️ Streaming from an offline cache',
	});
	expect(result.data.fields).toContainEqual({
		name: 'Bridged URL',
		value: `[YouTube](${EXAMPLE_BRIDGE_URL})`,
		inline: true,
	});
});
