import type { Track } from 'discord-player';
import {
	MOCK_TRACK_AUTHOR,
	MOCK_TRACK_DURATION,
	MOCK_TRACK_ID,
	MOCK_TRACK_TITLE,
	MOCK_TRACK_URL,
} from './constants';

export function createMockTrack(overrides: Partial<Track> = {}): Track {
	return {
		id: MOCK_TRACK_ID,
		title: MOCK_TRACK_TITLE,
		cleanTitle: MOCK_TRACK_TITLE,
		author: MOCK_TRACK_AUTHOR,
		url: MOCK_TRACK_URL,
		duration: MOCK_TRACK_DURATION,
		durationMS: 180000,
		metadata: {},
		requestedBy: {
			id: 'user-123',
		},
		...overrides,
	} as Track;
}

export function createMinimalMockTrack(id: string): Track<unknown> {
	return { id } as Track<unknown>;
}
