import { expect, it } from 'vitest';
import sanitizeForFilename from '../sanitizeForFilename';

it('should lowercase the input', () => {
	expect(sanitizeForFilename('Hello World', 100)).toBe('hello_world');
});

it('should replace invalid characters with underscores', () => {
	expect(sanitizeForFilename('file/name:test*"<>|', 100)).toBe(
		'file_name_test',
	);
});

it('should collapse multiple spaces into single underscore', () => {
	expect(sanitizeForFilename('hello    world', 100)).toBe('hello_world');
});

it('should collapse multiple underscores into single underscore', () => {
	expect(sanitizeForFilename('hello___world', 100)).toBe('hello_world');
});

it('should remove leading underscores', () => {
	expect(sanitizeForFilename('___hello', 100)).toBe('hello');
});

it('should remove trailing underscores', () => {
	expect(sanitizeForFilename('hello___', 100)).toBe('hello');
});

it('should truncate to max length', () => {
	expect(sanitizeForFilename('this is a very long string', 10)).toBe(
		'this_is_a_',
	);
});

it('should handle combined transformations', () => {
	expect(sanitizeForFilename('  Hello: World!  ', 50)).toBe('hello_world!');
});

it('should handle empty string', () => {
	expect(sanitizeForFilename('', 100)).toBe('');
});

it('should handle string with only invalid characters', () => {
	expect(sanitizeForFilename('/:*?"<>|', 100)).toBe('');
});

it('should handle real track titles', () => {
	expect(sanitizeForFilename('Never Gonna Give You Up', 100)).toBe(
		'never_gonna_give_you_up',
	);
	expect(sanitizeForFilename('Bohemian Rhapsody (Remastered 2011)', 100)).toBe(
		'bohemian_rhapsody_(remastered_2011)',
	);
});

it('should preserve safe special characters', () => {
	expect(sanitizeForFilename('Song! (feat. Artist)', 100)).toBe(
		'song!_(feat._artist)',
	);
});

it('should strip diacritics from accented characters', () => {
	expect(sanitizeForFilename('nawrócenie', 100)).toBe('nawrocenie');
	expect(sanitizeForFilename('Café Résumé', 100)).toBe('cafe_resume');
	expect(sanitizeForFilename('Müller Naïve Señor', 100)).toBe(
		'muller_naive_senor',
	);
});

it('should transliterate non-Latin characters', () => {
	expect(sanitizeForFilename('狐懦愛dautriche', 100)).toBe(
		'hu_nuo_ai_dautriche',
	);
	expect(sanitizeForFilename('Hello 世界 World', 100)).toBe(
		'hello_shi_jie_world',
	);
	expect(sanitizeForFilename('Привет мир', 100)).toBe('privet_mir');
});

it('should replace square brackets with underscores', () => {
	expect(sanitizeForFilename('Song [Official Video]', 100)).toBe(
		'song_official_video',
	);
	expect(sanitizeForFilename('[Remix] Track Name', 100)).toBe(
		'remix_track_name',
	);
});
