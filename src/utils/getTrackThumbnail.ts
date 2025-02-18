import { type Track, serialize } from 'discord-player';
import memoize from 'memoize';
import isObject from './isObject';

/*
	Prefer Spotify thumbnails unless it's the default one with their logo.

	In that case, try to use the YouTube thumbnail.
*/
function getTrackThumbnail(track: Track) {
	if (!URL.canParse(track.thumbnail)) {
		return null;
	}

	if (track.thumbnail.includes('twitter_card-default')) {
		if (!isObject(track.metadata) || !isObject(track.metadata.bridge)) {
			return null;
		}

		if (
			typeof track.metadata.bridge?.thumbnail === 'string' &&
			URL.canParse(track.metadata.bridge.thumbnail)
		) {
			return track.metadata.bridge.thumbnail;
		}

		return null;
	}

	return track.thumbnail;
}

export default memoize(getTrackThumbnail, {
	cacheKey: ([track]) => serialize(track),
});
