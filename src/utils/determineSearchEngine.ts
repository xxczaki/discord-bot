import type { SearchQueryType } from 'discord-player';

export default function determineSearchEngine(query: string): SearchQueryType {
	if (query.startsWith('!sc')) {
		return 'soundcloud';
	}

	if (query.includes('soundcloud.com')) {
		return 'soundcloudTrack';
	}

	if (query.includes('youtube.com') || query.includes('youtu.be')) {
		return 'youtubeVideo';
	}

	if (query.startsWith('!yt')) {
		return 'youtubeSearch';
	}

	return 'spotifySearch';
}
