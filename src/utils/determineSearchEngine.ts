import type { SearchQueryType } from 'discord-player';

export default function determineSearchEngine(query: string): SearchQueryType {
	if (query.startsWith('!sc')) {
		return 'soundcloud';
	}

	return 'spotifySearch';
}
