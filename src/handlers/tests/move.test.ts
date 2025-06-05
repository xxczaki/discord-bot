import { useQueue } from 'discord-player';
import type { Track } from 'discord-player';
import type { ChatInputCommandInteraction } from 'discord.js';
import { beforeEach, expect, it, vi } from 'vitest';
import moveCommandHandler from '../move';

const EXAMPLE_TRACK_TITLE = 'Never Gonna Give You Up';
const EXAMPLE_TRACK_AUTHOR = 'Rick Astley';
const EXAMPLE_TRACK_ID = 'track-123';

vi.mock('discord-player', () => ({
	useQueue: vi.fn(),
}));

const mockedUseQueue = vi.mocked(useQueue);

beforeEach(() => {
	vi.clearAllMocks();
});

function createMockTrack(overrides: Partial<Track> = {}): Track {
	return {
		id: EXAMPLE_TRACK_ID,
		title: EXAMPLE_TRACK_TITLE,
		author: EXAMPLE_TRACK_AUTHOR,
		url: 'https://example.com/track',
		duration: '3:32',
		metadata: {},
		...overrides,
	} as Track;
}

function createMockInteraction(
	query: string,
	to: number,
): ChatInputCommandInteraction {
	return {
		options: {
			getString: vi.fn().mockReturnValue(query),
			getInteger: vi.fn().mockReturnValue(to),
		},
		reply: vi.fn().mockResolvedValue({}),
	} as unknown as ChatInputCommandInteraction;
}

function createMockQueue(
	tracks: (Track | undefined)[] = [],
): NonNullable<ReturnType<typeof useQueue>> {
	return {
		tracks: {
			at: vi.fn().mockImplementation((index: number) => tracks[index]),
		},
		moveTrack: vi.fn(),
		node: {
			skip: vi.fn(),
		},
	} as unknown as NonNullable<ReturnType<typeof useQueue>>;
}

it('should reply with error when `query` is not a number', async () => {
	const interaction = createMockInteraction('not-a-number', 3);
	const mockQueue = createMockQueue();
	mockedUseQueue.mockReturnValue(mockQueue);

	await moveCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith({
		content: 'Please provide a number.',
		flags: ['Ephemeral'],
	});
});

it('should reply with error when `from` and `to` positions are the same', async () => {
	const interaction = createMockInteraction('3', 3);
	const mockQueue = createMockQueue();
	mockedUseQueue.mockReturnValue(mockQueue);

	await moveCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith({
		content: 'Nothing to move.',
		flags: ['Ephemeral'],
	});
});

it('should move track to position 0 and skip when `to` is less than 0', async () => {
	const mockTrack = createMockTrack();
	const mockQueue = createMockQueue([undefined, mockTrack]);
	const interaction = createMockInteraction('3', 1);

	mockedUseQueue.mockReturnValue(mockQueue);

	await moveCommandHandler(interaction);

	expect(mockQueue.moveTrack).toHaveBeenCalledWith(mockTrack, 0);
	expect(mockQueue.node.skip).toHaveBeenCalled();
	expect(interaction.reply).toHaveBeenCalledWith('Skipping the current track.');
});

it('should move track to specified position', async () => {
	const mockTrack = createMockTrack();
	const mockQueue = createMockQueue([undefined, mockTrack]);
	const interaction = createMockInteraction('3', 5);

	mockedUseQueue.mockReturnValue(mockQueue);

	await moveCommandHandler(interaction);

	expect(mockQueue.moveTrack).toHaveBeenCalledWith(1, 3);
	expect(interaction.reply).toHaveBeenCalledWith(
		`Moved "${mockTrack.title}" to position \`5\`.`,
	);
});

it('should handle when track to move is not found', async () => {
	const mockQueue = createMockQueue([]);
	const interaction = createMockInteraction('3', 5);

	mockedUseQueue.mockReturnValue(mockQueue);

	await moveCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith({
		content: 'Could not move the track, are the specified positions correct?',
		flags: ['Ephemeral'],
	});
});

it('should handle when `moveTrack` throws an error', async () => {
	const mockTrack = createMockTrack();
	const mockQueue = createMockQueue([undefined, mockTrack]);
	const interaction = createMockInteraction('3', 5);

	mockQueue.moveTrack = vi.fn().mockImplementation(() => {
		throw new Error('Move failed');
	});

	mockedUseQueue.mockReturnValue(mockQueue);

	await moveCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith({
		content: 'Could not move the track, are the specified positions correct?',
		flags: ['Ephemeral'],
	});
});

it('should handle when queue is null', async () => {
	const interaction = createMockInteraction('3', 5);
	mockedUseQueue.mockReturnValue(null);

	await moveCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith({
		content: 'No music is currently playing.',
		flags: ['Ephemeral'],
	});
});

it('should handle edge case where `to` is exactly -2 (becomes -4 after subtraction)', async () => {
	const mockTrack = createMockTrack();
	const mockQueue = createMockQueue([undefined, mockTrack]);
	const interaction = createMockInteraction('3', -2);

	mockedUseQueue.mockReturnValue(mockQueue);

	await moveCommandHandler(interaction);

	expect(mockQueue.moveTrack).toHaveBeenCalledWith(mockTrack, 0);
	expect(mockQueue.node.skip).toHaveBeenCalled();
	expect(interaction.reply).toHaveBeenCalledWith('Skipping the current track.');
});

it('should handle when `node.skip` throws an error during skip operation', async () => {
	const mockTrack = createMockTrack();
	const mockQueue = createMockQueue([undefined, mockTrack]);
	const interaction = createMockInteraction('3', 1);

	mockQueue.node.skip = vi.fn().mockImplementation(() => {
		throw new Error('Skip failed');
	});

	mockedUseQueue.mockReturnValue(mockQueue);

	await moveCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith({
		content: 'Could not move the track, are the specified positions correct?',
		flags: ['Ephemeral'],
	});
});
