import type { ChatInputCommandInteraction } from 'discord.js';
import { useQueue } from 'discord-player';
import { beforeEach, expect, it, vi } from 'vitest';
import {
	createMockInteraction as createBaseMockInteraction,
	createMockQueue as createBaseMockQueue,
	createMockTrack,
	MOCK_TRACK_TITLE,
} from '../../utils/testing';
import removeCommandHandler from '../remove';

vi.mock('discord-player', () => ({
	useQueue: vi.fn(),
}));

const mockedUseQueue = vi.mocked(useQueue);

beforeEach(() => {
	vi.clearAllMocks();
});

function createMockInteraction(query: string): ChatInputCommandInteraction {
	return createBaseMockInteraction({ getString: query });
}

function createMockQueue(): NonNullable<ReturnType<typeof useQueue>> {
	return createBaseMockQueue({
		tracksAt: () => undefined,
		removeTrack: true,
		node: {
			skip: vi.fn(),
		},
	});
}

it('should reply with error when `query` is not a number', async () => {
	const interaction = createMockInteraction('not-a-number');
	const mockQueue = createMockQueue();
	mockedUseQueue.mockReturnValue(mockQueue);

	await removeCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith({
		content: 'Please provide a number.',
		flags: ['Ephemeral'],
	});
});

it('should skip current track when track number is less than 0', async () => {
	const mockTrack = createMockTrack();
	const mockQueue = createMockQueue();

	mockQueue.tracks.at = vi.fn().mockImplementation((index: number) => {
		if (index === -1) return mockTrack;
		return undefined;
	});

	const interaction = createMockInteraction('1');

	mockedUseQueue.mockReturnValue(mockQueue);

	await removeCommandHandler(interaction);

	expect(mockQueue.node.skip).toHaveBeenCalled();
	expect(interaction.reply).toHaveBeenCalledWith('Skipping the current track.');
	expect(mockQueue.removeTrack).not.toHaveBeenCalled();
});

it('should remove track at specified position', async () => {
	const mockTrack = createMockTrack();
	const mockQueue = createMockQueue();

	mockQueue.tracks.at = vi.fn().mockImplementation((index: number) => {
		if (index === 2) return mockTrack;
		return undefined;
	});

	const interaction = createMockInteraction('4');

	mockedUseQueue.mockReturnValue(mockQueue);

	await removeCommandHandler(interaction);

	expect(mockQueue.removeTrack).toHaveBeenCalledWith(2);
	expect(interaction.reply).toHaveBeenCalledWith(
		`Track "${MOCK_TRACK_TITLE}" removed.`,
	);
	expect(mockQueue.node.skip).not.toHaveBeenCalled();
});

it('should remove track with custom title', async () => {
	const customTitle = 'Custom Song Title';
	const mockTrack = createMockTrack({ title: customTitle });
	const mockQueue = createMockQueue();

	mockQueue.tracks.at = vi.fn().mockImplementation((index: number) => {
		if (index === 1) return mockTrack;
		return undefined;
	});
	const interaction = createMockInteraction('3');

	mockedUseQueue.mockReturnValue(mockQueue);

	await removeCommandHandler(interaction);

	expect(mockQueue.removeTrack).toHaveBeenCalledWith(1);
	expect(interaction.reply).toHaveBeenCalledWith(
		`Track "${customTitle}" removed.`,
	);
});

it('should handle error when track does not exist', async () => {
	const mockQueue = createMockQueue();
	const interaction = createMockInteraction('5');

	mockedUseQueue.mockReturnValue(mockQueue);

	await removeCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith({
		content: 'Could not remove the track, is the specified id correct?',
		flags: ['Ephemeral'],
	});
});

it('should handle error when queue is null', async () => {
	const interaction = createMockInteraction('3');
	mockedUseQueue.mockReturnValue(null);

	await removeCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith({
		content: 'No music is currently playing.',
		flags: ['Ephemeral'],
	});
});

it('should handle error when track at position is undefined', async () => {
	const mockQueue = createMockQueue();
	const interaction = createMockInteraction('3');

	mockedUseQueue.mockReturnValue(mockQueue);

	await removeCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith({
		content: 'Could not remove the track, is the specified id correct?',
		flags: ['Ephemeral'],
	});
});

it('should handle edge case with track number 2 (index 0)', async () => {
	const mockTrack = createMockTrack();
	const mockQueue = createMockQueue();

	mockQueue.tracks.at = vi.fn().mockImplementation((index: number) => {
		if (index === 0) return mockTrack;
		return undefined;
	});
	const interaction = createMockInteraction('2');

	mockedUseQueue.mockReturnValue(mockQueue);

	await removeCommandHandler(interaction);

	expect(mockQueue.removeTrack).toHaveBeenCalledWith(0);
	expect(interaction.reply).toHaveBeenCalledWith(
		`Track "${MOCK_TRACK_TITLE}" removed.`,
	);
});

it('should handle removeTrack throwing an error', async () => {
	const mockTrack = createMockTrack();
	const mockQueue = createMockQueue();

	mockQueue.tracks.at = vi.fn().mockImplementation((index: number) => {
		if (index === 0) return mockTrack;
		return undefined;
	});
	mockQueue.removeTrack = vi.fn().mockImplementation(() => {
		throw new Error('Remove failed');
	});

	const interaction = createMockInteraction('2');

	mockedUseQueue.mockReturnValue(mockQueue);

	await removeCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith({
		content: 'Could not remove the track, is the specified id correct?',
		flags: ['Ephemeral'],
	});
});
