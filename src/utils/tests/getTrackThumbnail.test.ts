import type { Track } from 'discord-player';
import { beforeEach, expect, it, vi } from 'vitest';
import getTrackThumbnail from '../getTrackThumbnail';

vi.mock('discord-player', () => ({
	serialize: vi.fn((track) => JSON.stringify(track)),
}));

const EXAMPLE_THUMBNAIL_URL = 'https://example.com/thumbnail.jpg';
const EXAMPLE_DEFAULT_SPOTIFY_THUMBNAIL =
	'https://example.com/twitter_card-default.jpg';
const EXAMPLE_YOUTUBE_THUMBNAIL = 'https://example.com/youtube-thumbnail.jpg';

beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
});

it('should return null for invalid thumbnail URLs', () => {
	const track = {
		thumbnail: 'not-a-url',
	} as Track;

	expect(getTrackThumbnail(track)).toBeNull();
});

it('should return the track thumbnail if valid and not default Spotify', () => {
	const track = {
		thumbnail: EXAMPLE_THUMBNAIL_URL,
	} as Track;

	expect(getTrackThumbnail(track)).toBe(EXAMPLE_THUMBNAIL_URL);
});

it('should return bridge thumbnail for default Spotify thumbnail', () => {
	const track = {
		thumbnail: EXAMPLE_DEFAULT_SPOTIFY_THUMBNAIL,
		metadata: {
			bridge: {
				thumbnail: EXAMPLE_YOUTUBE_THUMBNAIL,
			},
		},
	} as Track;

	expect(getTrackThumbnail(track)).toBe(EXAMPLE_YOUTUBE_THUMBNAIL);
});

it('should return null if bridge thumbnail is invalid', () => {
	const track = {
		thumbnail: EXAMPLE_DEFAULT_SPOTIFY_THUMBNAIL,
		metadata: {
			bridge: {
				thumbnail: 'not-a-url',
			},
		},
	} as Track;

	expect(getTrackThumbnail(track)).toBeNull();
});

it('should return null if metadata is missing for the default Spotify thumbnail', () => {
	const track = {
		thumbnail: EXAMPLE_DEFAULT_SPOTIFY_THUMBNAIL,
	} as Track;

	expect(getTrackThumbnail(track)).toBeNull();
});
