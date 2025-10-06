import type { GuildQueue, Track } from 'discord-player';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	moveTracksByPattern,
	removeTracksByPattern,
	skipCurrentTrack,
	TrackMatcher,
} from '../queueOperations';

function createMockTrack(title: string, author: string, id?: string): Track {
	return {
		id: id || `track-${Math.random()}`,
		title,
		author,
		url: 'https://example.com/track',
		duration: '3:45',
		metadata: {},
	} as Track;
}

function createMockQueue(
	tracks: Track[],
	currentTrack?: Track | null,
): GuildQueue {
	return {
		tracks: {
			toArray: vi.fn().mockReturnValue(tracks),
		},
		currentTrack: currentTrack ?? null,
		removeTrack: vi.fn(),
		moveTrack: vi.fn(),
		node: {
			skip: vi.fn(),
		},
	} as unknown as GuildQueue;
}

describe('TrackMatcher', () => {
	it('should match tracks by artist pattern', () => {
		const matcher = new TrackMatcher('bob dylan', undefined);
		const track1 = createMockTrack('Like a Rolling Stone', 'Bob Dylan');
		const track2 = createMockTrack('Hey Jude', 'The Beatles');

		expect(matcher.matches(track1)).toBe(true);
		expect(matcher.matches(track2)).toBe(false);
	});

	it('should match tracks by title pattern', () => {
		const matcher = new TrackMatcher(undefined, 'rolling');
		const track1 = createMockTrack('Like a Rolling Stone', 'Bob Dylan');
		const track2 = createMockTrack('Hey Jude', 'The Beatles');

		expect(matcher.matches(track1)).toBe(true);
		expect(matcher.matches(track2)).toBe(false);
	});

	it('should match tracks by both artist and title', () => {
		const matcher = new TrackMatcher('dylan', 'rolling');
		const track1 = createMockTrack('Like a Rolling Stone', 'Bob Dylan');
		const track2 = createMockTrack('Rolling in the Deep', 'Adele');
		const track3 = createMockTrack('Tangled Up in Blue', 'Bob Dylan');

		expect(matcher.matches(track1)).toBe(true);
		expect(matcher.matches(track2)).toBe(false);
		expect(matcher.matches(track3)).toBe(false);
	});

	it('should be case-insensitive', () => {
		const matcher = new TrackMatcher('BOB DYLAN', 'ROLLING');
		const track = createMockTrack('like a rolling stone', 'bob dylan');

		expect(matcher.matches(track)).toBe(true);
	});

	it('should match all tracks when no patterns specified', () => {
		const matcher = new TrackMatcher(undefined, undefined);
		const track1 = createMockTrack('Song 1', 'Artist 1');
		const track2 = createMockTrack('Song 2', 'Artist 2');

		expect(matcher.matches(track1)).toBe(true);
		expect(matcher.matches(track2)).toBe(true);
	});

	it('should support partial matching', () => {
		const matcher = new TrackMatcher('beat', 'hey');
		const track = createMockTrack('Hey Jude', 'The Beatles');

		expect(matcher.matches(track)).toBe(true);
	});
});

describe('removeTracksByPattern', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should remove tracks matching artist pattern', () => {
		const tracks = [
			createMockTrack('Like a Rolling Stone', 'Bob Dylan', 'track-1'),
			createMockTrack('Hey Jude', 'The Beatles', 'track-2'),
			createMockTrack('Tangled Up in Blue', 'Bob Dylan', 'track-3'),
		];
		const queue = createMockQueue(tracks);

		const result = removeTracksByPattern(queue, 'bob dylan');

		expect(result.success).toBe(true);
		expect(result.removedFromQueue).toBe(2);
		expect(result.skippedCurrent).toBe(false);
		expect(result.removedCount).toBe(2);
		expect(queue.removeTrack).toHaveBeenCalledTimes(2);
	});

	it('should remove tracks matching title pattern', () => {
		const tracks = [
			createMockTrack('Like a Rolling Stone', 'Bob Dylan', 'track-1'),
			createMockTrack('Rolling in the Deep', 'Adele', 'track-2'),
			createMockTrack('Hey Jude', 'The Beatles', 'track-3'),
		];
		const queue = createMockQueue(tracks);

		const result = removeTracksByPattern(queue, undefined, 'rolling');

		expect(result.success).toBe(true);
		expect(result.removedFromQueue).toBe(2);
		expect(queue.removeTrack).toHaveBeenCalledTimes(2);
	});

	it('should skip current track if it matches', () => {
		const tracks = [createMockTrack('Hey Jude', 'The Beatles', 'track-1')];
		const currentTrack = createMockTrack(
			'Like a Rolling Stone',
			'Bob Dylan',
			'current',
		);
		const queue = createMockQueue(tracks, currentTrack);

		const result = removeTracksByPattern(queue, 'bob dylan');

		expect(result.success).toBe(true);
		expect(result.skippedCurrent).toBe(true);
		expect(result.removedCount).toBe(1);
		expect(queue.node.skip).toHaveBeenCalledTimes(1);
	});

	it('should remove from queue and skip current when both match', () => {
		const tracks = [
			createMockTrack('Tangled Up in Blue', 'Bob Dylan', 'track-1'),
			createMockTrack('Hey Jude', 'The Beatles', 'track-2'),
		];
		const currentTrack = createMockTrack(
			'Like a Rolling Stone',
			'Bob Dylan',
			'current',
		);
		const queue = createMockQueue(tracks, currentTrack);

		const result = removeTracksByPattern(queue, 'bob dylan');

		expect(result.success).toBe(true);
		expect(result.removedFromQueue).toBe(1);
		expect(result.skippedCurrent).toBe(true);
		expect(result.removedCount).toBe(2);
		expect(queue.removeTrack).toHaveBeenCalledTimes(1);
		expect(queue.node.skip).toHaveBeenCalledTimes(1);
	});

	it('should handle empty queue', () => {
		const queue = createMockQueue([]);

		const result = removeTracksByPattern(queue, 'bob dylan');

		expect(result.success).toBe(true);
		expect(result.removedCount).toBe(0);
		expect(queue.removeTrack).not.toHaveBeenCalled();
	});

	it('should handle no matches', () => {
		const tracks = [createMockTrack('Hey Jude', 'The Beatles', 'track-1')];
		const queue = createMockQueue(tracks);

		const result = removeTracksByPattern(queue, 'bob dylan');

		expect(result.success).toBe(true);
		expect(result.removedCount).toBe(0);
		expect(queue.removeTrack).not.toHaveBeenCalled();
	});
});

describe('moveTracksByPattern', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should move tracks to the front of queue', () => {
		const tracks = [
			createMockTrack('Song 1', 'Artist 1', 'track-1'),
			createMockTrack('Song 2', 'Artist 2', 'track-2'),
			createMockTrack('Song 3', 'Artist 3', 'track-3'),
		];
		const queue = createMockQueue(tracks);

		const result = moveTracksByPattern(queue, 'artist 2', undefined, 0);

		expect(result.success).toBe(true);
		expect(result.movedCount).toBe(1);
		expect(queue.moveTrack).toHaveBeenCalledWith(tracks[1], 0);
	});

	it('should move tracks to the end of queue', () => {
		const tracks = [
			createMockTrack('Song 1', 'Artist 1', 'track-1'),
			createMockTrack('Song 2', 'Artist 2', 'track-2'),
			createMockTrack('Song 3', 'Artist 3', 'track-3'),
		];
		const queue = createMockQueue(tracks);

		const result = moveTracksByPattern(queue, 'artist 1', undefined, -1);

		expect(result.success).toBe(true);
		expect(result.movedCount).toBe(1);
		expect(queue.moveTrack).toHaveBeenCalledWith(tracks[0], 2);
	});

	it('should move multiple tracks to front in reverse order', () => {
		const tracks = [
			createMockTrack('Song 1', 'Bob Dylan', 'track-1'),
			createMockTrack('Song 2', 'The Beatles', 'track-2'),
			createMockTrack('Song 3', 'Bob Dylan', 'track-3'),
		];
		const queue = createMockQueue(tracks);

		const result = moveTracksByPattern(queue, 'bob dylan', undefined, 0);

		expect(result.success).toBe(true);
		expect(result.movedCount).toBe(2);
		expect(queue.moveTrack).toHaveBeenCalledTimes(2);
	});

	it('should throw error when no tracks match', () => {
		const tracks = [createMockTrack('Song 1', 'Artist 1', 'track-1')];
		const queue = createMockQueue(tracks);

		expect(() =>
			moveTracksByPattern(queue, 'nonexistent', undefined, 0),
		).toThrow('No tracks found matching the criteria');
	});

	it('should move tracks to specific position', () => {
		const tracks = [
			createMockTrack('Song 1', 'Artist 1', 'track-1'),
			createMockTrack('Song 2', 'Artist 2', 'track-2'),
			createMockTrack('Song 3', 'Artist 3', 'track-3'),
			createMockTrack('Song 4', 'Artist 4', 'track-4'),
		];
		const queue = createMockQueue(tracks);

		const result = moveTracksByPattern(queue, 'artist 4', undefined, 1);

		expect(result.success).toBe(true);
		expect(result.movedCount).toBe(1);
		expect(queue.moveTrack).toHaveBeenCalledWith(tracks[3], 1);
	});
});

describe('skipCurrentTrack', () => {
	it('should skip the current track', () => {
		const queue = createMockQueue([]);

		const result = skipCurrentTrack(queue);

		expect(result.success).toBe(true);
		expect(queue.node.skip).toHaveBeenCalledTimes(1);
	});
});
