import { join } from 'node:path';
import { beforeEach, expect, it, vi } from 'vitest';
import getOpusCacheTrackPath from '../getOpusCacheTrackPath';

const MOCK_CACHE_DIRECTORY = '/mock/cache/directory';

vi.mock('../getOpusCacheDirectoryPath', () => ({
	default: vi.fn(() => '/mock/cache/directory'),
}));

vi.mock('memoize', () => ({
	default: vi.fn((fn) => fn),
}));

beforeEach(() => {
	vi.clearAllMocks();
});

it.each([
	['simple URL', 'https://example.com/track.mp3'],
	[
		'URL with special characters',
		'https://example.com/track with spaces & symbols!.mp3',
	],
	[
		'URL with query parameters',
		'https://example.com/track.mp3?quality=high&format=opus',
	],
	['very long URL', `https://example.com/${'a'.repeat(1000)}.mp3`],
])('should generate correct path for %s', (_, url) => {
	const expectedFilename = `${Buffer.from(url).toString('base64url')}.opus`;
	const expectedPath = join(MOCK_CACHE_DIRECTORY, expectedFilename);

	const result = getOpusCacheTrackPath(url);

	expect(result).toBe(expectedPath);
});

it('should generate different paths for different URLs', () => {
	const url1 = 'https://example.com/track1.mp3';
	const url2 = 'https://example.com/track2.mp3';

	const result1 = getOpusCacheTrackPath(url1);
	const result2 = getOpusCacheTrackPath(url2);

	expect(result1).not.toBe(result2);
});

it('should generate same path for identical URLs', () => {
	const url = 'https://example.com/track.mp3';

	const result1 = getOpusCacheTrackPath(url);
	const result2 = getOpusCacheTrackPath(url);

	expect(result1).toBe(result2);
});

it.each([
	'https://example.com/track.mp3',
	'https://example.com/song.wav',
	'https://example.com/audio',
	'https://example.com/music.flac',
])('should always append .opus extension for `%s`', (url) => {
	const result = getOpusCacheTrackPath(url);
	expect(result).toMatch(/\.opus$/);
});
