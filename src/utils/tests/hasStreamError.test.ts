import type { Track } from 'discord-player';
import { expect, it } from 'vitest';
import hasStreamError from '../hasStreamError.ts';

function createTrack(
	metadata: unknown,
	bridgedMetadata?: unknown,
): Pick<Track, 'metadata' | 'bridgedTrack'> {
	return {
		metadata,
		bridgedTrack:
			bridgedMetadata === undefined
				? null
				: ({ metadata: bridgedMetadata } as Track),
	};
}

it('should return `true` when the track has a `streamError`', () => {
	const track = createTrack({ streamError: new Error('failed') });

	expect(hasStreamError(track as Track)).toBe(true);
});

it('should return `true` when only the bridged track has a `streamError`', () => {
	const track = createTrack(
		{ cacheFilename: 'eye_in_the_sky_284.opus' },
		{ streamError: new Error('Stream stalled 3 times. Aborting') },
	);

	expect(hasStreamError(track as Track)).toBe(true);
});

it('should return `false` when neither track has a `streamError`', () => {
	const track = createTrack({ cacheFilename: 'a.opus' }, {});

	expect(hasStreamError(track as Track)).toBe(false);
});

it('should return `false` for missing metadata', () => {
	const track = createTrack(null);

	expect(hasStreamError(track as Track)).toBe(false);
});
