import { expect, it } from 'vitest';
import cleanUpPlaylistContent from '../cleanUpPlaylistContent';

it('should extract content from triple backticks', () => {
	const input = `id="example"

\`\`\`
Song 1
Song 2
\`\`\`
some text after`;

	expect(cleanUpPlaylistContent(input)).toBe('Song 1\nSong 2');
});

it('should return empty string when no triple backticks found', () => {
	expect(cleanUpPlaylistContent('id="example" Song 1\nSong 2')).toBe('');
});

it('should handle content with single backticks but no triple backticks', () => {
	expect(cleanUpPlaylistContent('Content with `backticks` and id="123"')).toBe(
		'',
	);
});

it('should handle empty string', () => {
	expect(cleanUpPlaylistContent('')).toBe('');
});

it('should handle triple backticks with empty content', () => {
	expect(cleanUpPlaylistContent('id="test"\n```\n```')).toBe('');
});

it('should trim whitespace inside triple backticks', () => {
	const input = `id="example"
\`\`\`
  Song 1  
  Song 2  
\`\`\``;

	expect(cleanUpPlaylistContent(input)).toBe('Song 1  \n  Song 2');
});

it('should handle triple backticks without surrounding newlines', () => {
	expect(cleanUpPlaylistContent('id="test"```Song 1\nSong 2```after')).toBe(
		'Song 1\nSong 2',
	);
});

it('should handle multiline content with various formatting', () => {
	const input = `id="complex"

\`\`\`
https://open.spotify.com/playlist/123
https://example.com/song1
https://example.com/song2
\`\`\`

ignored content`;

	expect(cleanUpPlaylistContent(input)).toBe(
		'https://open.spotify.com/playlist/123\nhttps://example.com/song1\nhttps://example.com/song2',
	);
});

it('should only extract from first triple backticks if multiple exist', () => {
	const input = `id="test"
\`\`\`
First content
\`\`\`
\`\`\`
Second content
\`\`\``;

	expect(cleanUpPlaylistContent(input)).toBe('First content');
});

it('should extract content when id appears after triple backticks', () => {
	const input = `\`\`\`
Song 1
Song 2
\`\`\`
id="example"`;

	expect(cleanUpPlaylistContent(input)).toBe('Song 1\nSong 2');
});
