import memoize from 'memoize';

function isUrlSpotifyPlaylist(url: string) {
	return url.includes('spotify.com/playlist');
}

export default memoize(isUrlSpotifyPlaylist);
