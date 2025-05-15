import { expect, it } from 'vitest';
import isUrlSpotifyPlaylist from '../isUrlSpotifyPlaylist';

const EXAMPLE_PLAYLIST_URL =
	'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M';
const EXAMPLE_ALBUM_URL =
	'https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3';
const EXAMPLE_TRACK_URL =
	'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT';

it('should return true for a valid Spotify playlist URL', () => {
	expect(isUrlSpotifyPlaylist(EXAMPLE_PLAYLIST_URL)).toBe(true);
});

it('should return true for a Spotify playlist URL with additional parameters', () => {
	expect(isUrlSpotifyPlaylist(`${EXAMPLE_PLAYLIST_URL}?si=12345`)).toBe(true);
});

it('should return false for a Spotify album URL', () => {
	expect(isUrlSpotifyPlaylist(EXAMPLE_ALBUM_URL)).toBe(false);
});

it('should return false for a Spotify track URL', () => {
	expect(isUrlSpotifyPlaylist(EXAMPLE_TRACK_URL)).toBe(false);
});

it('should return false for a non-Spotify URL', () => {
	expect(isUrlSpotifyPlaylist('https://example.com/playlist/123')).toBe(false);
});

it('should return false for an empty string', () => {
	expect(isUrlSpotifyPlaylist('')).toBe(false);
});
