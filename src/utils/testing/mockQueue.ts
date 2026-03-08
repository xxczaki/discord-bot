import type { Track, useQueue } from 'discord-player';
import { vi } from 'vitest';

interface MockQueueOptions {
	tracks?: Track[];
	currentTrack?: Track | null;
	tracksAt?: (index: number) => Track | undefined;
	node?: Partial<{
		skip: ReturnType<typeof vi.fn>;
		setPaused: ReturnType<typeof vi.fn>;
		setVolume: ReturnType<typeof vi.fn>;
		getTimestamp: ReturnType<typeof vi.fn>;
	}>;
	filters?: { activeFilters?: string[] };
	moveTrack?: boolean;
	removeTrack?: boolean;
	guild?: { id: string };
	metadata?: Record<string, unknown>;
	size?: number;
}

export function createMockQueue(
	options: MockQueueOptions = {},
): NonNullable<ReturnType<typeof useQueue>> {
	const {
		tracks = [],
		currentTrack = null,
		tracksAt,
		node,
		filters,
		moveTrack = false,
		removeTrack = false,
		guild,
		metadata,
		size,
	} = options;

	const queue: Record<string, unknown> = {
		currentTrack,
		size: size ?? tracks.length,
	};

	if (tracksAt) {
		queue.tracks = {
			at: vi.fn().mockImplementation(tracksAt),
			data: tracks,
			store: [...tracks],
		};
	} else {
		queue.tracks = {
			store: [...tracks],
			data: tracks,
			at: vi.fn().mockImplementation((index: number) => tracks[index]),
			some: vi.fn((predicate) => tracks.some(predicate)),
			find: vi.fn((predicate) => tracks.find(predicate)),
			toArray: vi.fn().mockReturnValue(tracks),
		};
	}

	if (node) {
		queue.node = node;
	} else {
		queue.node = {
			skip: vi.fn(),
			getTimestamp: vi.fn().mockReturnValue(null),
		};
	}

	if (filters) {
		queue.filters = {
			ffmpeg: {
				filters: [...(filters.activeFilters ?? [])],
				toggle: vi.fn().mockResolvedValue(undefined),
			},
		};
	}

	if (moveTrack) {
		queue.moveTrack = vi.fn();
	}

	if (removeTrack) {
		queue.removeTrack = vi.fn();
	}

	if (guild) {
		queue.guild = guild;
	}

	if (metadata) {
		queue.metadata = metadata;
	}

	return queue as unknown as NonNullable<ReturnType<typeof useQueue>>;
}
