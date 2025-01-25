import type { SearchQueryType } from 'discord-player';

export default function determineSearchEngine(query: string): SearchQueryType {
	if (query.includes('youtube.com') || query.includes('youtu.be')) {
		return 'youtubeVideo';
	}

	if (query.startsWith('!yt')) {
		return 'youtubeSearch';
	}

	if (query.includes('spotify.com/playlist')) {
		return 'spotifyPlaylist';
	}

	if (query.includes('spotify.com')) {
		return 'spotifySong';
	}

	return 'spotifySearch';
}
