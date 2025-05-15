import { expect, it } from 'vitest';
import cleanUpPlaylistContent from '../cleanUpPlaylistContent';

it('should remove id attribute from the content', () => {
	expect(cleanUpPlaylistContent('Some content with id="123"')).toBe(
		'Some content with',
	);
});

it('should remove backticks from the content', () => {
	expect(cleanUpPlaylistContent('Content with `backticks`')).toBe(
		'Content with backticks',
	);
});

it('should trim whitespace from the content', () => {
	expect(cleanUpPlaylistContent('  Content with spaces  ')).toBe(
		'Content with spaces',
	);
});

it('should handle multiple transformations at once', () => {
	expect(
		cleanUpPlaylistContent('  Content with `backticks` and id="123"  '),
	).toBe('Content with backticks and');
});

it('should handle an empty string', () => {
	expect(cleanUpPlaylistContent('')).toBe('');
});

it('should handle string with only removable content', () => {
	expect(cleanUpPlaylistContent('id="123" `test`')).toBe('test');
});
