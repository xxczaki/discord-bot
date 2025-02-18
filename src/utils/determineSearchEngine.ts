import type { SearchQueryType } from 'discord-player';
import memoize from 'memoize';
import isUrlSpotifyPlaylist from './isUrlSpotifyPlaylist';

function determineSearchEngine(query: string): SearchQueryType {
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

export default memoize(determineSearchEngine);
