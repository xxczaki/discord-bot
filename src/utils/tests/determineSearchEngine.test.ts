import { describe, expect, it, vi } from 'vitest';
import determineSearchEngine from '../determineSearchEngine';

const { youtubeEnabled } = vi.hoisted(() => ({
	youtubeEnabled: { value: false },
}));

vi.mock('../../constants/sourceConfig', () => ({
	get YOUTUBE_ENABLED() {
		return youtubeEnabled.value;
	},
}));

const EXAMPLE_YOUTUBE_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const EXAMPLE_YOUTUBE_SHORT_URL = 'https://youtu.be/dQw4w9WgXcQ';
const EXAMPLE_SPOTIFY_PLAYLIST_URL =
	'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M';
const EXAMPLE_SPOTIFY_TRACK_URL =
	'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT';
const EXAMPLE_SOUNDCLOUD_URL = 'https://soundcloud.com/artist/track-name';
const EXAMPLE_SOUNDCLOUD_SHORT_URL = 'https://snd.sc/abc123';

it('should identify YouTube video URLs', () => {
	expect(determineSearchEngine(EXAMPLE_YOUTUBE_URL)).toBe('youtubeVideo');
	expect(determineSearchEngine(EXAMPLE_YOUTUBE_SHORT_URL)).toBe('youtubeVideo');
});

it('should identify Spotify playlist URLs', () => {
	expect(determineSearchEngine(EXAMPLE_SPOTIFY_PLAYLIST_URL)).toBe(
		'spotifyPlaylist',
	);
});

it('should identify Spotify song URLs', () => {
	expect(determineSearchEngine(EXAMPLE_SPOTIFY_TRACK_URL)).toBe('spotifySong');
});

it('should default to spotifySearch for non-URL queries', () => {
	expect(determineSearchEngine('never gonna give you up')).toBe(
		'spotifySearch',
	);
	expect(determineSearchEngine('')).toBe('spotifySearch');
});

describe('SoundCloud URLs', () => {
	it('should identify SoundCloud URLs when YouTube is disabled', () => {
		youtubeEnabled.value = false;

		expect(determineSearchEngine(EXAMPLE_SOUNDCLOUD_URL)).toBe(
			'soundcloudTrack',
		);
		expect(determineSearchEngine(EXAMPLE_SOUNDCLOUD_SHORT_URL)).toBe(
			'soundcloudTrack',
		);
	});

	it('should fall through to spotifySearch when YouTube is enabled', () => {
		youtubeEnabled.value = true;

		expect(determineSearchEngine(EXAMPLE_SOUNDCLOUD_URL)).toBe('spotifySearch');
		expect(determineSearchEngine(EXAMPLE_SOUNDCLOUD_SHORT_URL)).toBe(
			'spotifySearch',
		);
	});
});
