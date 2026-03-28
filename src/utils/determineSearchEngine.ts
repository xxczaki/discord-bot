import type { SearchQueryType } from 'discord-player';
import isUrlSpotifyPlaylist from './isUrlSpotifyPlaylist';

function determineSearchEngine(query: string): SearchQueryType {
	if (query.includes('youtube.com') || query.includes('youtu.be')) {
		return 'youtubeVideo';
	}

	if (query.includes('soundcloud.com') || query.includes('snd.sc')) {
		return 'soundcloudTrack';
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
