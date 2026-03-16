import type { ChatInputCommandInteraction } from 'discord.js';
import type { QueueFilters } from 'discord-player';
import { useMainPlayer, useQueue } from 'discord-player';
import { beforeEach, expect, it, vi } from 'vitest';
import {
	createMockInteraction as createBaseMockInteraction,
	createMockQueue as createBaseMockQueue,
	createMockResponse as createBaseMockResponse,
	createMockSelectMenuComponent,
} from '../../utils/testing';
import tempoCommandHandler from '../tempo';

vi.mock('discord-player', () => ({
	useQueue: vi.fn(),
	useMainPlayer: vi.fn(),
}));

const mockedUseQueue = vi.mocked(useQueue);
const mockedUseMainPlayer = vi.mocked(useMainPlayer);

beforeEach(() => {
	vi.clearAllMocks();

	mockedUseMainPlayer.mockReturnValue({
		events: {
			on: vi.fn(),
			off: vi.fn(),
		},
	} as unknown as ReturnType<typeof useMainPlayer>);
});

function createMockInteraction() {
	return createBaseMockInteraction({
		editReply: true,
	}) as unknown as ChatInputCommandInteraction;
}

function createMockResponse() {
	return createBaseMockResponse();
}

function createMockQueue(activeFilters: string[] = []) {
	return createBaseMockQueue({
		filters: { activeFilters },
	});
}

it('should create correct select menu with tempo options', async () => {
	const interaction = createMockInteraction();
	const mockResponse = createMockResponse();
	const mockQueue = createMockQueue([]);

	interaction.editReply = vi.fn().mockResolvedValue(mockResponse);
	mockedUseQueue.mockReturnValue(mockQueue);

	mockResponse.awaitMessageComponent = vi
		.fn()
		.mockRejectedValue(new Error('timeout'));

	await tempoCommandHandler(interaction);

	expect(interaction.editReply).toHaveBeenCalledWith({
		components: expect.any(Array),
	});
});

it('should toggle new tempo filter when no active tempo', async () => {
	const interaction = createMockInteraction();
	const mockResponse = createMockResponse();
	const mockQueue = createMockQueue(['bassboost']);

	interaction.editReply = vi.fn().mockResolvedValue(mockResponse);
	mockedUseQueue.mockReturnValue(mockQueue);

	const mockComponent = createMockSelectMenuComponent(['_tempo15']);
	mockResponse.awaitMessageComponent = vi.fn().mockResolvedValue(mockComponent);

	await tempoCommandHandler(interaction);

	expect(mockQueue.filters.ffmpeg.toggle).toHaveBeenCalledWith('_tempo15');
	expect(mockComponent.reply).toHaveBeenCalledWith(
		'Modifying the playback speed…',
	);
	expect(mockComponent.editReply).toHaveBeenCalledWith({
		content: 'The playback speed was modified.',
		components: [],
	});
});

it('should remove active tempo filter when `normal` is selected', async () => {
	const interaction = createMockInteraction();
	const mockResponse = createMockResponse();
	const mockQueue = createMockQueue(['_tempo075', 'bassboost']);

	interaction.editReply = vi.fn().mockResolvedValue(mockResponse);
	mockedUseQueue.mockReturnValue(mockQueue);

	const mockComponent = createMockSelectMenuComponent(['normal']);
	mockResponse.awaitMessageComponent = vi.fn().mockResolvedValue(mockComponent);

	await tempoCommandHandler(interaction);

	expect(mockQueue.filters.ffmpeg.toggle).toHaveBeenCalledWith('_tempo075');
	expect(mockComponent.reply).toHaveBeenCalledWith(
		'Modifying the playback speed…',
	);
	expect(mockComponent.editReply).toHaveBeenCalledWith({
		content: 'The playback speed was modified.',
		components: [],
	});
});

it('should replace active tempo with new tempo when different tempo selected', async () => {
	const interaction = createMockInteraction();
	const mockResponse = createMockResponse();
	const mockQueue = createMockQueue(['_tempo05', 'bassboost']);

	interaction.editReply = vi.fn().mockResolvedValue(mockResponse);
	mockedUseQueue.mockReturnValue(mockQueue);

	const mockComponent = createMockSelectMenuComponent(['_tempo2']);
	mockResponse.awaitMessageComponent = vi.fn().mockResolvedValue(mockComponent);

	await tempoCommandHandler(interaction);

	expect(mockQueue.filters.ffmpeg.toggle).toHaveBeenCalledWith([
		'_tempo05',
		'_tempo2',
	] as unknown as Array<keyof QueueFilters>);
	expect(mockComponent.reply).toHaveBeenCalledWith(
		'Modifying the playback speed…',
	);
	expect(mockComponent.editReply).toHaveBeenCalledWith({
		content: 'The playback speed was modified.',
		components: [],
	});
});

it('should handle non-string-select-menu component', async () => {
	const interaction = createMockInteraction();
	const mockResponse = createMockResponse();
	const mockQueue = createMockQueue([]);

	interaction.editReply = vi.fn().mockResolvedValue(mockResponse);
	mockedUseQueue.mockReturnValue(mockQueue);

	const mockComponent = {
		isStringSelectMenu: () => false,
		editReply: vi.fn().mockResolvedValue(undefined),
	};
	mockResponse.awaitMessageComponent = vi.fn().mockResolvedValue(mockComponent);

	await tempoCommandHandler(interaction);

	expect(mockComponent.editReply).toHaveBeenCalledWith({
		content: 'Nothing was selected; the playback speed remains as is.',
		components: [],
	});
});

it('should handle timeout gracefully', async () => {
	const interaction = createMockInteraction();
	const mockResponse = createMockResponse();
	const mockQueue = createMockQueue([]);

	interaction.editReply = vi.fn().mockResolvedValue(mockResponse);
	mockedUseQueue.mockReturnValue(mockQueue);

	mockResponse.awaitMessageComponent = vi
		.fn()
		.mockRejectedValue(new Error('timeout'));

	await tempoCommandHandler(interaction);
});

it('should work when no queue is available', async () => {
	const interaction = createMockInteraction();
	const mockResponse = createMockResponse();

	interaction.editReply = vi.fn().mockResolvedValue(mockResponse);
	interaction.editReply = vi.fn().mockResolvedValue(mockResponse);
	mockedUseQueue.mockReturnValue(null);

	await tempoCommandHandler(interaction);

	expect(interaction.editReply).toHaveBeenCalledWith(
		'No music is currently playing.',
	);
});

it('should detect active tempo filter correctly', async () => {
	const interaction = createMockInteraction();
	const mockResponse = createMockResponse();
	const mockQueue = createMockQueue(['_tempo125', 'bassboost']);

	interaction.editReply = vi.fn().mockResolvedValue(mockResponse);
	mockedUseQueue.mockReturnValue(mockQueue);

	const mockComponent = createMockSelectMenuComponent(['normal']);
	mockResponse.awaitMessageComponent = vi.fn().mockResolvedValue(mockComponent);

	await tempoCommandHandler(interaction);

	expect(mockQueue.filters.ffmpeg.toggle).toHaveBeenCalledWith('_tempo125');
});

it('should handle multiple tempo filters by using the first one found', async () => {
	const interaction = createMockInteraction();
	const mockResponse = createMockResponse();

	const mockQueue = createMockQueue(['_tempo05', '_tempo125', 'bassboost']);

	interaction.editReply = vi.fn().mockResolvedValue(mockResponse);
	mockedUseQueue.mockReturnValue(mockQueue);

	const mockComponent = createMockSelectMenuComponent(['normal']);
	mockResponse.awaitMessageComponent = vi.fn().mockResolvedValue(mockComponent);

	await tempoCommandHandler(interaction);

	expect(mockQueue.filters.ffmpeg.toggle).toHaveBeenCalledWith('_tempo05');
});

it('should handle error during component await', async () => {
	const interaction = createMockInteraction();
	const mockResponse = createMockResponse();
	const mockQueue = createMockQueue([]);

	interaction.editReply = vi.fn().mockResolvedValue(mockResponse);
	mockedUseQueue.mockReturnValue(mockQueue);

	mockResponse.awaitMessageComponent = vi
		.fn()
		.mockRejectedValue(new Error('Component collection timed out'));

	await tempoCommandHandler(interaction);
});
