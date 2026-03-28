export function resolveFallbackSource(source?: string) {
	const isYouTube = source === 'youtube';

	return {
		searchEngine: isYouTube
			? ('youtubeSearch' as const)
			: ('soundcloudSearch' as const),
		sourceName: isYouTube ? 'YouTube' : 'SoundCloud',
	};
}

const { searchEngine, sourceName } = resolveFallbackSource(
	process.env.FALLBACK_SOURCE,
);

export const FALLBACK_SEARCH_ENGINE = searchEngine;
export const FALLBACK_SOURCE_NAME = sourceName;
