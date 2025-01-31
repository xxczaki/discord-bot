import type { SearchQueryType } from 'discord-player';
import isUrlSpotifyPlaylist from './isUrlSpotifyPlaylist';

export default function determineSearchEngine(query: string): SearchQueryType {
	if (query.includes('youtube.com') || query.includes('youtu.be')) {
		return 'youtubeVideo';
	}

	if (query.startsWith('!yt')) {
		return 'youtubeSearch';
	}

	if (isUrlSpotifyPlaylist(query)) {
		return 'spotifyPlaylist';
	}

	if (query.includes('spotify.com')) {
		return 'spotifySong';
	}

	return 'spotifySearch';
}
