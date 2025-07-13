import type { SearchQueryType } from 'discord-player';
import isUrlSpotifyPlaylist from './isUrlSpotifyPlaylist';

function determineSearchEngine(query: string): SearchQueryType {
	if (query.includes('youtube.com') || query.includes('youtu.be')) {
		return 'youtubeVideo';
	}

	if (isUrlSpotifyPlaylist(query)) {
		return 'spotifyPlaylist';
	}

	if (query.includes('spotify.com')) {
		return 'spotifySong';
	}

	return 'spotifySearch';
}

export default determineSearchEngine;
