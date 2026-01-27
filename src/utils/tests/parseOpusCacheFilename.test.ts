import { expect, it } from 'vitest';
import parseOpusCacheFilename from '../parseOpusCacheFilename';

it('should parse filename with duration', () => {
	const result = parseOpusCacheFilename(
		'never_gonna_give_you_up_rick_astley_213.opus',
	);

	expect(result).toEqual({
		title: 'never gonna give you up rick astley',
		author: '',
		durationSeconds: 213,
	});
});

it('should parse filename without duration (live stream)', () => {
	const result = parseOpusCacheFilename('live_stream_streamer.opus');

	expect(result).toEqual({
		title: 'live stream streamer',
		author: '',
		durationSeconds: null,
	});
});

it('should return null for non-opus files', () => {
	expect(parseOpusCacheFilename('file.mp3')).toBeNull();
	expect(parseOpusCacheFilename('file.wav')).toBeNull();
});

it('should return null for files with less than 2 parts', () => {
	expect(parseOpusCacheFilename('single.opus')).toBeNull();
});

it('should handle complex titles with underscores', () => {
	const result = parseOpusCacheFilename(
		'song_part_1_feat_guest_artist_200.opus',
	);

	expect(result).toEqual({
		title: 'song part 1 feat guest artist',
		author: '',
		durationSeconds: 200,
	});
});

it('should return null for empty filename', () => {
	expect(parseOpusCacheFilename('.opus')).toBeNull();
});

it('should handle filename with two parts (no duration)', () => {
	const result = parseOpusCacheFilename('title_author.opus');

	expect(result).toEqual({
		title: 'title author',
		author: '',
		durationSeconds: null,
	});
});
