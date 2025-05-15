import type { GuildQueue, Track } from 'discord-player';
import { expect, it } from 'vitest';
import getTrackPosition from '../getTrackPosition';

// Minimal Track implementation for testing
const createMockTrack = (id: string): Track<unknown> =>
	({
		id,
	}) as Track<unknown>;

const createMockQueue = (tracks: Track<unknown>[]): GuildQueue<unknown> =>
	({
		tracks: {
			find: (fn) => tracks.find(fn),
			data: tracks,
		},
	}) as GuildQueue<unknown>;

it('should return 0 when queue is null', () => {
	const track = createMockTrack('123');

	expect(getTrackPosition(null, track)).toBe(0);
});

it('should return 0 when track is not found in queue', () => {
	const track = createMockTrack('not-in-queue');
	const queue = createMockQueue([createMockTrack('1'), createMockTrack('2')]);

	expect(getTrackPosition(queue, track)).toBe(0);
});

it('should return correct position when track is in queue', () => {
	const targetTrack = createMockTrack('2');
	const queue = createMockQueue([
		createMockTrack('1'),
		targetTrack,
		createMockTrack('3'),
	]);

	expect(getTrackPosition(queue, targetTrack)).toBe(1);
});

it('should return correct position for first track', () => {
	const targetTrack = createMockTrack('1');
	const queue = createMockQueue([
		targetTrack,
		createMockTrack('2'),
		createMockTrack('3'),
	]);

	expect(getTrackPosition(queue, targetTrack)).toBe(0);
});

it('should return correct position for last track', () => {
	const targetTrack = createMockTrack('3');
	const queue = createMockQueue([
		createMockTrack('1'),
		createMockTrack('2'),
		targetTrack,
	]);

	expect(getTrackPosition(queue, targetTrack)).toBe(2);
});
