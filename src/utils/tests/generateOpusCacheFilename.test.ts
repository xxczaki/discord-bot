import { expect, it } from 'vitest';
import generateOpusCacheFilename from '../generateOpusCacheFilename';

it('should generate filename with title, author, and duration', () => {
	const result = generateOpusCacheFilename({
		title: 'Never Gonna Give You Up',
		author: 'Rick Astley',
		durationMS: 213000,
	});

	expect(result).toBe('never_gonna_give_you_up_rick_astley_213.opus');
});

it('should omit duration for live streams (zero duration)', () => {
	const result = generateOpusCacheFilename({
		title: 'Live Stream',
		author: 'Streamer',
		durationMS: 0,
	});

	expect(result).toBe('live_stream_streamer.opus');
});

it('should use "unknown_title" for empty title', () => {
	const result = generateOpusCacheFilename({
		title: '',
		author: 'Artist',
		durationMS: 180000,
	});

	expect(result).toBe('unknown_title_artist_180.opus');
});

it('should use "unknown_artist" for empty author', () => {
	const result = generateOpusCacheFilename({
		title: 'Song',
		author: '',
		durationMS: 180000,
	});

	expect(result).toBe('song_unknown_artist_180.opus');
});

it('should truncate long titles', () => {
	const longTitle = 'a'.repeat(150);
	const result = generateOpusCacheFilename({
		title: longTitle,
		author: 'Artist',
		durationMS: 180000,
	});

	expect(result.length).toBeLessThanOrEqual(100 + 50 + 10 + 6);
	expect(result).toMatch(/^a{100}_artist_180\.opus$/);
});

it('should truncate long author names', () => {
	const longAuthor = 'b'.repeat(100);
	const result = generateOpusCacheFilename({
		title: 'Song',
		author: longAuthor,
		durationMS: 180000,
	});

	expect(result).toMatch(/^song_b{50}_180\.opus$/);
});

it('should round duration to nearest second', () => {
	const result = generateOpusCacheFilename({
		title: 'Song',
		author: 'Artist',
		durationMS: 180500,
	});

	expect(result).toBe('song_artist_181.opus');
});

it('should handle special characters in title and author', () => {
	const result = generateOpusCacheFilename({
		title: 'Song: Part 1 (feat. Guest)',
		author: 'Artist & Band',
		durationMS: 200000,
	});

	expect(result).toBe('song_part_1_(feat._guest)_artist_&_band_200.opus');
});
