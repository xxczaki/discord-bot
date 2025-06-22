import type { ChatInputCommandInteraction } from 'discord.js';
import { useQueue } from 'discord-player';
import { beforeEach, expect, it, vi } from 'vitest';
import sortCommandHandler from '../sort';

vi.mock('discord-player', () => ({
	useQueue: vi.fn(),
}));

const mockedUseQueue = vi.mocked(useQueue);

beforeEach(() => {
	vi.clearAllMocks();
});

function createMockInteraction(): ChatInputCommandInteraction {
	return {
		reply: vi.fn().mockResolvedValue({}),
		editReply: vi.fn().mockResolvedValue({}),
	} as unknown as ChatInputCommandInteraction;
}

function createMockQueue(tracks: Array<{ title: string }> = []) {
	return {
		tracks: {
			data: tracks,
			store: tracks,
		},
	} as unknown as NonNullable<ReturnType<typeof useQueue>>;
}

it('should reply with ephemeral message when queue is empty', async () => {
	const interaction = createMockInteraction();
	mockedUseQueue.mockReturnValue(null);

	await sortCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith({
		content: 'The queue is empty.',
		flags: ['Ephemeral'],
	});
	expect(interaction.editReply).not.toHaveBeenCalled();
});

it('should sort tracks alphabetically by title', async () => {
	const interaction = createMockInteraction();
	const unsortedTracks = [
		{ title: 'Zebra Song' },
		{ title: 'Apple Music' },
		{ title: 'banana track' },
		{ title: 'Cherry Blossom' },
	];
	const mockQueue = createMockQueue(unsortedTracks);
	mockedUseQueue.mockReturnValue(mockQueue);

	await sortCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith('Sorting the queue…');
	expect(interaction.editReply).toHaveBeenCalledWith(
		'Queue sorted alphabetically.',
	);

	const expectedOrder = [
		{ title: 'Apple Music' },
		{ title: 'banana track' },
		{ title: 'Cherry Blossom' },
		{ title: 'Zebra Song' },
	];
	expect(mockQueue.tracks.store).toEqual(expectedOrder);
});

it('should handle queue with single track', async () => {
	const interaction = createMockInteraction();
	const singleTrack = [{ title: 'Only Song' }];
	const mockQueue = createMockQueue(singleTrack);
	mockedUseQueue.mockReturnValue(mockQueue);

	await sortCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith('Sorting the queue…');
	expect(interaction.editReply).toHaveBeenCalledWith(
		'Queue sorted alphabetically.',
	);
	expect(mockQueue.tracks.store).toEqual(singleTrack);
});

it('should handle queue with tracks having identical titles', async () => {
	const interaction = createMockInteraction();
	const identicalTracks = [
		{ title: 'Same Title' },
		{ title: 'Same Title' },
		{ title: 'Different Title' },
	];
	const mockQueue = createMockQueue(identicalTracks);
	mockedUseQueue.mockReturnValue(mockQueue);

	await sortCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith('Sorting the queue…');
	expect(interaction.editReply).toHaveBeenCalledWith(
		'Queue sorted alphabetically.',
	);

	const expectedOrder = [
		{ title: 'Different Title' },
		{ title: 'Same Title' },
		{ title: 'Same Title' },
	];
	expect(mockQueue.tracks.store).toEqual(expectedOrder);
});

it('should handle queue with empty track titles', async () => {
	const interaction = createMockInteraction();
	const tracksWithEmptyTitles = [
		{ title: 'Real Title' },
		{ title: '' },
		{ title: 'Another Title' },
	];
	const mockQueue = createMockQueue(tracksWithEmptyTitles);
	mockedUseQueue.mockReturnValue(mockQueue);

	await sortCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith('Sorting the queue…');
	expect(interaction.editReply).toHaveBeenCalledWith(
		'Queue sorted alphabetically.',
	);

	const expectedOrder = [
		{ title: '' },
		{ title: 'Another Title' },
		{ title: 'Real Title' },
	];
	expect(mockQueue.tracks.store).toEqual(expectedOrder);
});
