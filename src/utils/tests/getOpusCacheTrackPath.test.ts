import { join } from 'node:path';
import { beforeEach, expect, it, vi } from 'vitest';
import getOpusCacheTrackPath from '../getOpusCacheTrackPath';

const MOCK_CACHE_DIRECTORY = '/mock/cache/directory';

vi.mock('../getOpusCacheDirectoryPath', () => ({
	default: vi.fn(() => '/mock/cache/directory'),
}));

beforeEach(() => {
	vi.clearAllMocks();
});

it.each([
	{
		description: 'simple track',
		metadata: {
			title: 'Never Gonna Give You Up',
			author: 'Rick Astley',
			durationMS: 213000,
		},
		expectedFilename: 'never_gonna_give_you_up_rick_astley_213.opus',
	},
	{
		description: 'track with special characters',
		metadata: {
			title: 'Song: With *Special* Characters!',
			author: 'Artist "Name"',
			durationMS: 180000,
		},
		expectedFilename: 'song_with_special_characters!_artist_name_180.opus',
	},
	{
		description: 'live stream (zero duration)',
		metadata: {
			title: 'Live Stream',
			author: 'Streamer',
			durationMS: 0,
		},
		expectedFilename: 'live_stream_streamer.opus',
	},
])('should generate correct path for $description', ({
	metadata,
	expectedFilename,
}) => {
	const expectedPath = join(MOCK_CACHE_DIRECTORY, expectedFilename);

	const result = getOpusCacheTrackPath(metadata);

	expect(result).toBe(expectedPath);
});

it('should generate different paths for tracks with different metadata', () => {
	const metadata1 = { title: 'Track 1', author: 'Artist', durationMS: 180000 };
	const metadata2 = { title: 'Track 2', author: 'Artist', durationMS: 180000 };

	const result1 = getOpusCacheTrackPath(metadata1);
	const result2 = getOpusCacheTrackPath(metadata2);

	expect(result1).not.toBe(result2);
});

it('should generate same path for identical metadata', () => {
	const metadata = {
		title: 'Same Track',
		author: 'Same Artist',
		durationMS: 200000,
	};

	const result1 = getOpusCacheTrackPath(metadata);
	const result2 = getOpusCacheTrackPath(metadata);

	expect(result1).toBe(result2);
});

it('should always append .opus extension', () => {
	const metadata = {
		title: 'Any Track',
		author: 'Any Artist',
		durationMS: 120000,
	};

	const result = getOpusCacheTrackPath(metadata);

	expect(result).toMatch(/\.opus$/);
});
