import { expect, it } from 'vitest';
import { resolveFallbackSource } from '../fallbackSource';

it('should default to SoundCloud when source is undefined', () => {
	const result = resolveFallbackSource(undefined);

	expect(result.searchEngine).toBe('soundcloudSearch');
	expect(result.sourceName).toBe('SoundCloud');
});

it('should use YouTube when source is `youtube`', () => {
	const result = resolveFallbackSource('youtube');

	expect(result.searchEngine).toBe('youtubeSearch');
	expect(result.sourceName).toBe('YouTube');
});
