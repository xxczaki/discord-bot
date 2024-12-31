import type { SearchQueryType } from 'discord-player';

export default function determineSearchEngine(query: string): SearchQueryType {
	if (query.startsWith('!sc')) {
		return 'soundcloud';
	}

	if (query.includes('https://soundcloud.com/')) {
		return 'soundcloudTrack';
	}

	if (
		query.includes('https://youtube.com/') ||
		query.includes('https://youtu.be/')
	) {
		return 'youtubeVideo';
	}

	return 'spotifySearch';
}
