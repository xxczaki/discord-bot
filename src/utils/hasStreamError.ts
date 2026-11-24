import type { Track } from 'discord-player';
import isObject from './isObject.ts';

export default function hasStreamError(track: Track): boolean {
	return [track.metadata, track.bridgedTrack?.metadata].some(
		(metadata) => isObject(metadata) && 'streamError' in metadata,
	);
}
