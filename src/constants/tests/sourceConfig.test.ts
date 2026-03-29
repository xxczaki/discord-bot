import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
	vi.unstubAllEnvs();
	vi.resetModules();
});

it('should default to SoundCloud when ENABLE_YOUTUBE is not set', async () => {
	const { YOUTUBE_ENABLED, FALLBACK_SEARCH_ENGINE, DEFAULT_SOURCE_NAME } =
		await import('../sourceConfig');

	expect(YOUTUBE_ENABLED).toBe(false);
	expect(FALLBACK_SEARCH_ENGINE).toBe('soundcloudSearch');
	expect(DEFAULT_SOURCE_NAME).toBe('SoundCloud');
});

it('should use YouTube when ENABLE_YOUTUBE is `true`', async () => {
	vi.stubEnv('ENABLE_YOUTUBE', 'true');

	const { YOUTUBE_ENABLED, FALLBACK_SEARCH_ENGINE, DEFAULT_SOURCE_NAME } =
		await import('../sourceConfig');

	expect(YOUTUBE_ENABLED).toBe(true);
	expect(FALLBACK_SEARCH_ENGINE).toBe('youtubeSearch');
	expect(DEFAULT_SOURCE_NAME).toBe('YouTube');
});
