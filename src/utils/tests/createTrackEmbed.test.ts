import type { Stats } from 'node:fs';
import { stat } from 'node:fs/promises';
import { EmbedBuilder } from 'discord.js';
import type { Track } from 'discord-player';
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
const EXAMPLE_PLAYLIST_URL =
	'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M';
const EXAMPLE_BRIDGE_URL = 'https://youtube.com/watch?v=123';
const EXAMPLE_FILE_SIZE_BYTES = 2534656; // ~2.53 MB

vi.mock('discord-player', () => ({
	serialize: vi.fn(() => 'serialized-track'),
}));

vi.mock('../getTrackThumbnail', () => ({
	default: vi.fn(() => 'https://example.com/thumbnail.jpg'),
}));

vi.mock('node:fs/promises', () => ({
	stat: vi.fn(),
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

beforeEach(() => {
	vi.clearAllMocks();
});

it('should create basic embed with required fields', async () => {
	const track = createMockTrack();

	const result = await createTrackEmbed(track, EXAMPLE_DESCRIPTION);

	expect(result).toBeInstanceOf(EmbedBuilder);
	expect(result.data.title).toBe(EXAMPLE_TRACK_TITLE);
	expect(result.data.description).toBe(EXAMPLE_DESCRIPTION);
	expect(result.data.url).toBe(EXAMPLE_TRACK_URL);
	expect(result.data.author?.name).toBe(EXAMPLE_TRACK_AUTHOR);
	expect(result.data.fields).toEqual([
		{ name: 'Duration', value: EXAMPLE_TRACK_DURATION, inline: true },
	]);
});

it('should add query field when query is not a URL', async () => {
	const track = createMockTrack({
		metadata: {
			originalQuery: EXAMPLE_QUERY,
		},
	});

	const result = await createTrackEmbed(track, EXAMPLE_DESCRIPTION);

	expect(result.data.fields).toContainEqual({
		name: 'Query',
		value: `\`${EXAMPLE_QUERY}\``,
	});
});

it('should add query field when query is a URL', async () => {
	const track = createMockTrack({
		metadata: {
			originalQuery: EXAMPLE_URL_QUERY,
		},
	});

	const result = await createTrackEmbed(track, EXAMPLE_DESCRIPTION);

	expect(result.data.fields).toContainEqual({
		name: 'Query',
		value: `\`${EXAMPLE_URL_QUERY}\``,
	});
});

it('should not add query field when track has no originalQuery metadata', async () => {
	const track = createMockTrack();

	const result = await createTrackEmbed(track, EXAMPLE_DESCRIPTION);

	const queryField = result.data.fields?.find(
		(field) => field.name === 'Query',
	);
	expect(queryField).toBeUndefined();
});

it('should not add query field when originalQuery is a Spotify playlist URL', async () => {
	const track = createMockTrack({
		metadata: {
			originalQuery: EXAMPLE_PLAYLIST_URL,
		},
	});

	const result = await createTrackEmbed(track, EXAMPLE_DESCRIPTION);

	const queryField = result.data.fields?.find(
		(field) => field.name === 'Query',
	);
	expect(queryField).toBeUndefined();
});

it('should return embed when track metadata is not an object', async () => {
	const track = createMockTrack({ metadata: null });

	const result = await createTrackEmbed(track, EXAMPLE_DESCRIPTION);

	expect(result).toBeInstanceOf(EmbedBuilder);
	expect(result.data.footer).toBeUndefined();
});

it('should add cache footer when track `isFromCache`', async () => {
	vi.mocked(stat).mockResolvedValue({
		size: EXAMPLE_FILE_SIZE_BYTES,
		mtime: new Date(),
	} as Stats);

	const track = createMockTrack({
		metadata: {
			isFromCache: true,
		},
	});

	const result = await createTrackEmbed(track, EXAMPLE_DESCRIPTION);

	expect(result.data.footer).toEqual({
		text: '♻️ Streaming from the offline cache (2.53 MB)',
	});
});

it('should add cache footer without file size when stat fails', async () => {
	vi.mocked(stat).mockRejectedValue(new Error('File not found'));

	const track = createMockTrack({
		url: 'https://unique-url-for-stat-fail-test.com/track',
		metadata: {
			isFromCache: true,
		},
	});

	const result = await createTrackEmbed(track, EXAMPLE_DESCRIPTION);

	expect(result.data.footer).toEqual({
		text: '♻️ Streaming from the offline cache',
	});
});

it('should add bridged URL field when bridge metadata exists', async () => {
	const track = createMockTrack({
		metadata: {
			bridge: {
				url: EXAMPLE_BRIDGE_URL,
			},
		},
	});

	const result = await createTrackEmbed(track, EXAMPLE_DESCRIPTION);

	expect(result.data.fields).toContainEqual({
		name: 'Bridged URL',
		value: `[YouTube](${EXAMPLE_BRIDGE_URL})`,
		inline: true,
	});
});

it('should not add bridged URL field when bridge metadata is not an object', async () => {
	const track = createMockTrack({
		metadata: {
			bridge: null,
		},
	});

	const result = await createTrackEmbed(track, EXAMPLE_DESCRIPTION);

	const bridgeField = result.data.fields?.find(
		(field) => field.name === 'Bridged URL',
	);
	expect(bridgeField).toBeUndefined();
});

it('should not add bridged URL field when bridge URL is missing', async () => {
	const track = createMockTrack({
		metadata: {
			bridge: {},
		},
	});

	const result = await createTrackEmbed(track, EXAMPLE_DESCRIPTION);

	const bridgeField = result.data.fields?.find(
		(field) => field.name === 'Bridged URL',
	);
	expect(bridgeField).toBeUndefined();
});

it('should handle both cache footer and bridged URL together', async () => {
	vi.mocked(stat).mockResolvedValue({ size: EXAMPLE_FILE_SIZE_BYTES } as Stats);

	const track = createMockTrack({
		metadata: {
			isFromCache: true,
			bridge: {
				url: EXAMPLE_BRIDGE_URL,
			},
		},
	});

	const result = await createTrackEmbed(track, EXAMPLE_DESCRIPTION);

	expect(result.data.footer).toEqual({
		text: '♻️ Streaming from the offline cache (2.53 MB)',
	});
	expect(result.data.fields).toContainEqual({
		name: 'Bridged URL',
		value: `[YouTube](${EXAMPLE_BRIDGE_URL})`,
		inline: true,
	});
});
