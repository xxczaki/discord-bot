import type { GuildQueue, Track } from 'discord-player';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS } from '../../constants/miscellaneous';
import calculateSmartTimeout from '../calculateSmartTimeout';

const createMockQueue = (
	overrides: Partial<GuildQueue<unknown>> = {},
): GuildQueue<unknown> => {
	return {
		size: 0,
		currentTrack: null,
		tracks: {
			toArray: vi.fn().mockReturnValue([]),
		},
		node: {
			getTimestamp: vi.fn().mockReturnValue({
				current: { value: 0 },
			}),
		},
		...overrides,
	} as GuildQueue<unknown>;
};

const createMockTrack = (
	overrides: Partial<Track<unknown>> = {},
): Track<unknown> => {
	return {
		id: 'test-track-id',
		durationMS: 180000, // 3 minutes
		...overrides,
	} as Track<unknown>;
};

beforeEach(() => {
	vi.clearAllMocks();
});

afterEach(() => {
	vi.restoreAllMocks();
});

it('should return track duration for currently playing track in empty queue', () => {
	const track = createMockTrack({ id: 'current-track' });
	const queue = createMockQueue({
		size: 0,
		currentTrack: { id: 'current-track', durationMS: 240000 } as Track<unknown>, // 4 minutes
		node: {
			getTimestamp: vi.fn().mockReturnValue({
				current: { value: 60000 }, // 1 minute played
			}),
		},
	} as unknown as Partial<GuildQueue<unknown>>);

	const timeout = calculateSmartTimeout({
		queue,
		track,
		trackPosition: 0,
		isCurrentlyPlaying: true,
	});

	// Should be remaining duration: 240000 - 60000 = 180000 (3 minutes)
	expect(timeout).toBe(180000);
});

it('should respect minimum timeout for very short tracks', () => {
	const track = createMockTrack({ id: 'current-track' });
	const queue = createMockQueue({
		size: 0,
		currentTrack: { id: 'current-track', durationMS: 30000 } as Track<unknown>, // 30 seconds
		node: {
			getTimestamp: vi.fn().mockReturnValue({
				current: { value: 25000 }, // 25 seconds played
			}),
		},
	} as unknown as Partial<GuildQueue<unknown>>);

	const timeout = calculateSmartTimeout({
		queue,
		track,
		trackPosition: 0,
		isCurrentlyPlaying: true,
	});

	// Should be minimum timeout (30 seconds) since remaining time is only 5 seconds
	expect(timeout).toBe(30000);
});

it('should respect maximum timeout for very long tracks', () => {
	const track = createMockTrack({ id: 'current-track' });
	const queue = createMockQueue({
		size: 0,
		currentTrack: {
			id: 'current-track',
			durationMS: 3600000,
		} as Track<unknown>, // 1 hour
		node: {
			getTimestamp: vi.fn().mockReturnValue({
				current: { value: 0 }, // Just started
			}),
		},
	} as unknown as Partial<GuildQueue<unknown>>);

	const timeout = calculateSmartTimeout({
		queue,
		track,
		trackPosition: 0,
		isCurrentlyPlaying: true,
	});

	// Should be maximum timeout (10 minutes)
	expect(timeout).toBe(10 * 60 * 1000);
});

it('should calculate estimated play time for tracks early in queue', () => {
	const track = createMockTrack();
	const mockTracks = [
		{ durationMS: 240000 } as Track<unknown>, // 4 minutes (position 0)
		{ durationMS: 200000 } as Track<unknown>, // 3.33 minutes (position 1)
		{ durationMS: 160000 } as Track<unknown>, // 2.67 minutes (position 2, our track)
	];

	const queue = createMockQueue({
		size: 3,
		currentTrack: { id: 'current-track', durationMS: 180000 } as Track<unknown>, // 3 minutes
		tracks: {
			toArray: vi.fn().mockReturnValue(mockTracks),
		} as unknown as GuildQueue<unknown>['tracks'],
		node: {
			getTimestamp: vi.fn().mockReturnValue({
				current: { value: 60000 }, // 1 minute played of current track
			}),
		},
	} as unknown as Partial<GuildQueue<unknown>>);

	const timeout = calculateSmartTimeout({
		queue,
		track,
		trackPosition: 2, // Position 2 (0-indexed)
		isCurrentlyPlaying: false,
	});

	// Expected calculation:
	// Remaining current track: 180000 - 60000 = 120000 (2 minutes)
	// Track at position 0: 240000 (4 minutes)
	// Track at position 1: 200000 (3.33 minutes)
	// Total: 120000 + 240000 + 200000 = 560000 (9.33 minutes)
	expect(timeout).toBe(560000);
});

it('should use progressive timeout for tracks far back in queue', () => {
	const track = createMockTrack();
	const queue = createMockQueue({
		size: 10,
	});

	const timeout = calculateSmartTimeout({
		queue,
		track,
		trackPosition: 8, // Position 8
		isCurrentlyPlaying: false,
	});

	// Position factor: max(0.1, 1 - (8 - 3) * 0.1) = max(0.1, 0.5) = 0.5
	// Scaled timeout: DEFAULT_TIMEOUT * 0.5 = 30000
	const expectedTimeout = Math.max(
		DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS * 0.5,
		30000,
	);
	expect(timeout).toBe(expectedTimeout);
});

it('should use default timeout as fallback', () => {
	const track = createMockTrack();
	const queue = createMockQueue();

	const timeout = calculateSmartTimeout({
		queue,
		track,
		trackPosition: 0,
		isCurrentlyPlaying: false,
	});

	expect(timeout).toBe(DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS);
});
