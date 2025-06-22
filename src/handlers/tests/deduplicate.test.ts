import type { ChatInputCommandInteraction } from 'discord.js';
import type { Track } from 'discord-player';
import { useQueue } from 'discord-player';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import deduplicateCommandHandler from '../deduplicate';

const EXAMPLE_TRACK_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const EXAMPLE_TRACK_URL_2 =
	'https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh';
const EXAMPLE_TRACK_TITLE = 'Never Gonna Give You Up';
const EXAMPLE_TRACK_AUTHOR = 'Rick Astley';
const EXAMPLE_BRIDGE_URL = 'https://youtube.com/watch?v=123';

vi.mock('discord-player', () => ({
	useQueue: vi.fn(),
}));

const mockedUseQueue = vi.mocked(useQueue);

beforeEach(() => {
	vi.clearAllMocks();
});

function createMockTrack(overrides: Partial<Track> = {}): Track {
	return {
		id: `track-${Math.random()}`,
		title: EXAMPLE_TRACK_TITLE,
		author: EXAMPLE_TRACK_AUTHOR,
		url: EXAMPLE_TRACK_URL,
		duration: '3:32',
		metadata: {},
		...overrides,
	} as Track;
}

function createMockInteraction(algorithm: string): ChatInputCommandInteraction {
	return {
		options: {
			getString: vi.fn().mockReturnValue(algorithm),
		},
		reply: vi.fn().mockResolvedValue({}),
		editReply: vi.fn().mockResolvedValue({}),
	} as unknown as ChatInputCommandInteraction;
}

function createMockQueue(
	currentTrack: Track | null = null,
	tracks: Track[] = [],
): NonNullable<ReturnType<typeof useQueue>> {
	return {
		currentTrack,
		tracks: {
			store: [...tracks],
		},
		removeTrack: vi.fn(),
	} as unknown as NonNullable<ReturnType<typeof useQueue>>;
}

it('should reply with error when queue is empty', async () => {
	const interaction = createMockInteraction('source');
	mockedUseQueue.mockReturnValue(null);

	await deduplicateCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith({
		content: 'The queue is empty.',
		flags: ['Ephemeral'],
	});
});

it('should reply with error when invalid algorithm is provided', async () => {
	const interaction = createMockInteraction('invalid');
	const mockQueue = createMockQueue();
	mockedUseQueue.mockReturnValue(mockQueue);

	await deduplicateCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith({
		content: 'Incorrect deduplication algorithm specified, aborting…',
		flags: ['Ephemeral'],
	});
});

describe('`source` algorithm', () => {
	it('should handle no duplicates', async () => {
		const track1 = createMockTrack({ url: EXAMPLE_TRACK_URL });
		const track2 = createMockTrack({ url: EXAMPLE_TRACK_URL_2 });
		const interaction = createMockInteraction('source');
		const mockQueue = createMockQueue(track1, [track2]);

		mockedUseQueue.mockReturnValue(mockQueue);

		await deduplicateCommandHandler(interaction);

		expect(interaction.reply).toHaveBeenCalledWith('Searching for duplicates…');
		expect(interaction.editReply).toHaveBeenCalledWith(
			'No duplicates were found.',
		);
		expect(mockQueue.removeTrack).not.toHaveBeenCalled();
	});

	it('should handle duplicates', async () => {
		const track1 = createMockTrack({ url: EXAMPLE_TRACK_URL });
		const track2 = createMockTrack({ url: EXAMPLE_TRACK_URL }); // duplicate URL
		const track3 = createMockTrack({ url: EXAMPLE_TRACK_URL_2 });
		const interaction = createMockInteraction('source');
		const mockQueue = createMockQueue(track1, [track2, track3]);

		mockedUseQueue.mockReturnValue(mockQueue);

		await deduplicateCommandHandler(interaction);

		expect(interaction.reply).toHaveBeenCalledWith('Searching for duplicates…');
		expect(mockQueue.removeTrack).toHaveBeenCalledWith(track2);
		expect(mockQueue.removeTrack).toHaveBeenCalledTimes(1);
		expect(interaction.editReply).toHaveBeenCalledWith('Removed 1 duplicate.');
	});

	it('should not remove current track even if it is a duplicate', async () => {
		const track1 = createMockTrack({ url: EXAMPLE_TRACK_URL });
		const track2 = createMockTrack({ url: EXAMPLE_TRACK_URL }); // duplicate URL
		const interaction = createMockInteraction('source');
		const mockQueue = createMockQueue(track1, [track2]);

		mockedUseQueue.mockReturnValue(mockQueue);

		await deduplicateCommandHandler(interaction);

		// Only the second track should be removed, not the current track
		expect(mockQueue.removeTrack).toHaveBeenCalledWith(track2);
		expect(mockQueue.removeTrack).toHaveBeenCalledTimes(1);
	});

	it('should handle multiple duplicates', async () => {
		const track1 = createMockTrack({ url: EXAMPLE_TRACK_URL });
		const track2 = createMockTrack({ url: EXAMPLE_TRACK_URL }); // duplicate
		const track3 = createMockTrack({ url: EXAMPLE_TRACK_URL }); // duplicate
		const track4 = createMockTrack({ url: EXAMPLE_TRACK_URL_2 });
		const interaction = createMockInteraction('source');
		const mockQueue = createMockQueue(track1, [track2, track3, track4]);

		mockedUseQueue.mockReturnValue(mockQueue);

		await deduplicateCommandHandler(interaction);

		expect(mockQueue.removeTrack).toHaveBeenCalledWith(track2);
		expect(mockQueue.removeTrack).toHaveBeenCalledWith(track3);
		expect(mockQueue.removeTrack).toHaveBeenCalledTimes(2);
		expect(interaction.editReply).toHaveBeenCalledWith('Removed 2 duplicates.');
	});

	it('should update queue after each removal for accurate duplicate detection', async () => {
		const track1 = createMockTrack({ url: EXAMPLE_TRACK_URL });
		const track2 = createMockTrack({ url: EXAMPLE_TRACK_URL });
		const interaction = createMockInteraction('source');

		let currentTracks = [track2];
		const mockQueue = {
			currentTrack: track1,
			tracks: {
				get store() {
					return currentTracks;
				},
			},
			removeTrack: vi.fn().mockImplementation(() => {
				currentTracks = []; // Simulate track removal
			}),
		} as unknown as NonNullable<ReturnType<typeof useQueue>>;

		mockedUseQueue.mockReturnValue(mockQueue);

		await deduplicateCommandHandler(interaction);

		expect(mockQueue.removeTrack).toHaveBeenCalledTimes(1);
	});

	it('should handle empty queue after duplicate removal', async () => {
		const track1 = createMockTrack({ url: EXAMPLE_TRACK_URL });
		const track2 = createMockTrack({ url: EXAMPLE_TRACK_URL });
		const interaction = createMockInteraction('source');

		let currentTracks = [track2];
		const mockQueue = {
			currentTrack: track1,
			tracks: {
				get store() {
					return currentTracks;
				},
			},
			removeTrack: vi.fn().mockImplementation(() => {
				currentTracks = [];
			}),
		} as unknown as NonNullable<ReturnType<typeof useQueue>>;

		mockedUseQueue.mockReturnValue(mockQueue);

		await deduplicateCommandHandler(interaction);

		expect(mockQueue.removeTrack).toHaveBeenCalledTimes(1);
		expect(interaction.editReply).toHaveBeenCalledWith('Removed 1 duplicate.');
	});

	it('should handle current track being null', async () => {
		const track1 = createMockTrack({ url: EXAMPLE_TRACK_URL });
		const track2 = createMockTrack({ url: EXAMPLE_TRACK_URL });
		const interaction = createMockInteraction('source');
		const mockQueue = createMockQueue(null, [track1, track2]);

		mockedUseQueue.mockReturnValue(mockQueue);

		await deduplicateCommandHandler(interaction);

		expect(mockQueue.removeTrack).toHaveBeenCalledWith(track2);
		expect(mockQueue.removeTrack).toHaveBeenCalledTimes(1);
	});
});

describe('`bridged` algorithm', () => {
	it('should handle bridge metadata', async () => {
		const track1 = createMockTrack({
			url: EXAMPLE_TRACK_URL,
			metadata: {
				bridge: {
					url: EXAMPLE_BRIDGE_URL,
				},
			},
		});
		const track2 = createMockTrack({
			url: EXAMPLE_TRACK_URL_2,
			metadata: {
				bridge: {
					url: EXAMPLE_BRIDGE_URL, // same bridge URL
				},
			},
		});
		const interaction = createMockInteraction('bridged');
		const mockQueue = createMockQueue(track1, [track2]);

		mockedUseQueue.mockReturnValue(mockQueue);

		await deduplicateCommandHandler(interaction);

		expect(mockQueue.removeTrack).toHaveBeenCalledWith(track2);
		expect(mockQueue.removeTrack).toHaveBeenCalledTimes(1);
	});

	it('should fall back to track URL when bridge metadata is invalid', async () => {
		const track1 = createMockTrack({ url: EXAMPLE_TRACK_URL });
		const track2 = createMockTrack({ url: EXAMPLE_TRACK_URL }); // same URL
		const interaction = createMockInteraction('bridged');
		const mockQueue = createMockQueue(track1, [track2]);

		mockedUseQueue.mockReturnValue(mockQueue);

		await deduplicateCommandHandler(interaction);

		expect(mockQueue.removeTrack).toHaveBeenCalledWith(track2);
		expect(mockQueue.removeTrack).toHaveBeenCalledTimes(1);
	});

	it('should handle when bridge URL is not a valid URL', async () => {
		const track1 = createMockTrack({
			url: EXAMPLE_TRACK_URL,
			metadata: {
				bridge: {
					url: 'invalid-url',
				},
			},
		});
		const track2 = createMockTrack({ url: EXAMPLE_TRACK_URL }); // same fallback URL
		const interaction = createMockInteraction('bridged');
		const mockQueue = createMockQueue(track1, [track2]);

		mockedUseQueue.mockReturnValue(mockQueue);

		await deduplicateCommandHandler(interaction);

		expect(mockQueue.removeTrack).toHaveBeenCalledWith(track2);
		expect(mockQueue.removeTrack).toHaveBeenCalledTimes(1);
	});
});
