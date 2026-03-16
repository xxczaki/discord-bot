import type { ChatInputCommandInteraction } from 'discord.js';
import type { Track } from 'discord-player';
import { useQueue } from 'discord-player';
import { beforeEach, expect, it, vi } from 'vitest';
import {
	createMockInteraction as createBaseMockInteraction,
	createMockQueue as createBaseMockQueue,
	createMockTrack,
} from '../../utils/testing';
import moveCommandHandler from '../move';

vi.mock('discord-player', () => ({
	useQueue: vi.fn(),
}));

const mockedUseQueue = vi.mocked(useQueue);

beforeEach(() => {
	vi.clearAllMocks();
});

function createMockInteraction(
	query: string,
	to: number,
): ChatInputCommandInteraction {
	return createBaseMockInteraction({
		getString: query,
		getInteger: to,
		editReply: true,
	});
}

function createMockQueue(
	tracks: (Track | undefined)[] = [],
): NonNullable<ReturnType<typeof useQueue>> {
	return createBaseMockQueue({
		tracksAt: (index: number) => tracks[index],
		moveTrack: true,
		node: {
			skip: vi.fn(),
		},
	});
}

it('should reply with error when `query` is not a number', async () => {
	const interaction = createMockInteraction('not-a-number', 3);
	const mockQueue = createMockQueue();
	mockedUseQueue.mockReturnValue(mockQueue);

	await moveCommandHandler(interaction);

	expect(interaction.editReply).toHaveBeenCalledWith(
		'Please provide a number.',
	);
});

it('should reply with error when `from` and `to` positions are the same', async () => {
	const interaction = createMockInteraction('3', 3);
	const mockQueue = createMockQueue();
	mockedUseQueue.mockReturnValue(mockQueue);

	await moveCommandHandler(interaction);

	expect(interaction.editReply).toHaveBeenCalledWith('Nothing to move.');
});

it('should move track to position 0 and skip when `to` is less than 0', async () => {
	const mockTrack = createMockTrack();
	const mockQueue = createMockQueue([undefined, mockTrack]);
	const interaction = createMockInteraction('3', 1);

	mockedUseQueue.mockReturnValue(mockQueue);

	await moveCommandHandler(interaction);

	expect(mockQueue.moveTrack).toHaveBeenCalledWith(mockTrack, 0);
	expect(mockQueue.node.skip).toHaveBeenCalled();
	expect(interaction.editReply).toHaveBeenCalledWith(
		'Skipping the current track.',
	);
});

it('should move track to specified position', async () => {
	const mockTrack = createMockTrack();
	const mockQueue = createMockQueue([undefined, mockTrack]);
	const interaction = createMockInteraction('3', 5);

	mockedUseQueue.mockReturnValue(mockQueue);

	await moveCommandHandler(interaction);

	expect(mockQueue.moveTrack).toHaveBeenCalledWith(1, 3);
	expect(interaction.editReply).toHaveBeenCalledWith(
		`Moved "${mockTrack.title}" to position \`5\`.`,
	);
});

it('should handle when track to move is not found', async () => {
	const mockQueue = createMockQueue([]);
	const interaction = createMockInteraction('3', 5);

	mockedUseQueue.mockReturnValue(mockQueue);

	await moveCommandHandler(interaction);

	expect(interaction.editReply).toHaveBeenCalledWith(
		'Could not move the track, are the specified positions correct?',
	);
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

	expect(interaction.editReply).toHaveBeenCalledWith(
		'Could not move the track, are the specified positions correct?',
	);
});

it('should handle when queue is null', async () => {
	const interaction = createMockInteraction('3', 5);
	mockedUseQueue.mockReturnValue(null);

	await moveCommandHandler(interaction);

	expect(interaction.editReply).toHaveBeenCalledWith(
		'No music is currently playing.',
	);
});

it('should handle edge case where `to` is exactly -2 (becomes -4 after subtraction)', async () => {
	const mockTrack = createMockTrack();
	const mockQueue = createMockQueue([undefined, mockTrack]);
	const interaction = createMockInteraction('3', -2);

	mockedUseQueue.mockReturnValue(mockQueue);

	await moveCommandHandler(interaction);

	expect(mockQueue.moveTrack).toHaveBeenCalledWith(mockTrack, 0);
	expect(mockQueue.node.skip).toHaveBeenCalled();
	expect(interaction.editReply).toHaveBeenCalledWith(
		'Skipping the current track.',
	);
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

	expect(interaction.editReply).toHaveBeenCalledWith(
		'Could not move the track, are the specified positions correct?',
	);
});
