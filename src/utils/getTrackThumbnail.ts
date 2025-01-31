import type { Track } from 'discord-player';
import isObject from './isObject';

export default function getTrackThumbnail(track: Track) {
	const sourceThumbnail = URL.canParse(track.thumbnail)
		? track.thumbnail
		: null;

	if (!isObject(track.metadata) || !isObject(track.metadata.bridge)) {
		return sourceThumbnail;
	}

	if (
		// Prefer Spotify thumbnails unless it's the default one with their logo
		track.thumbnail.includes('twitter_card-default') &&
		typeof track.metadata.bridge?.thumbnail === 'string' &&
		URL.canParse(track.metadata.bridge.thumbnail)
	) {
		return track.metadata.bridge.thumbnail;
	}

	return sourceThumbnail;
}
