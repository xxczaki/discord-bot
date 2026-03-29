export const YOUTUBE_ENABLED = process.env.ENABLE_YOUTUBE === 'true';

export const FALLBACK_SEARCH_ENGINE = YOUTUBE_ENABLED
	? ('youtubeSearch' as const)
	: ('soundcloudSearch' as const);

export const DEFAULT_SOURCE_NAME = YOUTUBE_ENABLED ? 'YouTube' : 'SoundCloud';
