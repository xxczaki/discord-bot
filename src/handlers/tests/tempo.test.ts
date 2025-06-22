import type { ChatInputCommandInteraction } from 'discord.js';
import type { QueueFilters } from 'discord-player';
import { useMainPlayer, useQueue } from 'discord-player';
import { beforeEach, expect, it, vi } from 'vitest';
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
	return {
		reply: vi.fn(),
		editReply: vi.fn(),
	} as unknown as ChatInputCommandInteraction;
}

function createMockResponse() {
	return {
		awaitMessageComponent: vi.fn(),
		delete: vi.fn().mockResolvedValue(undefined),
	};
}

function createMockQueue(
	activeFilters: string[] = [],
): NonNullable<ReturnType<typeof useQueue>> {
	return {
		filters: {
			ffmpeg: {
				filters: activeFilters,
				toggle: vi.fn().mockResolvedValue(undefined),
			},
		},
	} as unknown as NonNullable<ReturnType<typeof useQueue>>;
}

function createMockComponent(values: string[] = []) {
	return {
		isStringSelectMenu: () => true,
		values,
		reply: vi.fn().mockResolvedValue(undefined),
		editReply: vi.fn().mockResolvedValue(undefined),
	};
}

it('should create correct select menu with tempo options', async () => {
	const interaction = createMockInteraction();
	const mockResponse = createMockResponse();
	const mockQueue = createMockQueue([]);

	interaction.reply = vi.fn().mockResolvedValue(mockResponse);
	mockedUseQueue.mockReturnValue(mockQueue);

	mockResponse.awaitMessageComponent.mockRejectedValue(new Error('timeout'));

	await tempoCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith({
		components: expect.any(Array),
	});
});

it('should toggle new tempo filter when no active tempo', async () => {
	const interaction = createMockInteraction();
	const mockResponse = createMockResponse();
	const mockQueue = createMockQueue(['bassboost']);

	interaction.reply = vi.fn().mockResolvedValue(mockResponse);
	mockedUseQueue.mockReturnValue(mockQueue);

	const mockComponent = createMockComponent(['_tempo15']);
	mockResponse.awaitMessageComponent.mockResolvedValue(mockComponent);

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

	interaction.reply = vi.fn().mockResolvedValue(mockResponse);
	mockedUseQueue.mockReturnValue(mockQueue);

	const mockComponent = createMockComponent(['normal']);
	mockResponse.awaitMessageComponent.mockResolvedValue(mockComponent);

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

	interaction.reply = vi.fn().mockResolvedValue(mockResponse);
	mockedUseQueue.mockReturnValue(mockQueue);

	const mockComponent = createMockComponent(['_tempo2']);
	mockResponse.awaitMessageComponent.mockResolvedValue(mockComponent);

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

	interaction.reply = vi.fn().mockResolvedValue(mockResponse);
	mockedUseQueue.mockReturnValue(mockQueue);

	const mockComponent = {
		isStringSelectMenu: () => false,
		editReply: vi.fn().mockResolvedValue(undefined),
	};
	mockResponse.awaitMessageComponent.mockResolvedValue(mockComponent);

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

	interaction.reply = vi.fn().mockResolvedValue(mockResponse);
	mockedUseQueue.mockReturnValue(mockQueue);

	mockResponse.awaitMessageComponent.mockRejectedValue(new Error('timeout'));

	await tempoCommandHandler(interaction);
});

it('should work when no queue is available', async () => {
	const interaction = createMockInteraction();
	const mockResponse = createMockResponse();

	interaction.reply = vi.fn().mockResolvedValue(mockResponse);
	interaction.editReply = vi.fn().mockResolvedValue(mockResponse);
	mockedUseQueue.mockReturnValue(null);

	await tempoCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith({
		content: 'No music is currently playing.',
		flags: ['Ephemeral'],
	});
});

it('should detect active tempo filter correctly', async () => {
	const interaction = createMockInteraction();
	const mockResponse = createMockResponse();
	const mockQueue = createMockQueue(['_tempo125', 'bassboost']);

	interaction.reply = vi.fn().mockResolvedValue(mockResponse);
	mockedUseQueue.mockReturnValue(mockQueue);

	const mockComponent = createMockComponent(['normal']);
	mockResponse.awaitMessageComponent.mockResolvedValue(mockComponent);

	await tempoCommandHandler(interaction);

	expect(mockQueue.filters.ffmpeg.toggle).toHaveBeenCalledWith('_tempo125');
});

it('should handle multiple tempo filters by using the first one found', async () => {
	const interaction = createMockInteraction();
	const mockResponse = createMockResponse();

	const mockQueue = createMockQueue(['_tempo05', '_tempo125', 'bassboost']);

	interaction.reply = vi.fn().mockResolvedValue(mockResponse);
	mockedUseQueue.mockReturnValue(mockQueue);

	const mockComponent = createMockComponent(['normal']);
	mockResponse.awaitMessageComponent.mockResolvedValue(mockComponent);

	await tempoCommandHandler(interaction);

	expect(mockQueue.filters.ffmpeg.toggle).toHaveBeenCalledWith('_tempo05');
});

it('should handle error during component await', async () => {
	const interaction = createMockInteraction();
	const mockResponse = createMockResponse();
	const mockQueue = createMockQueue([]);

	interaction.reply = vi.fn().mockResolvedValue(mockResponse);
	mockedUseQueue.mockReturnValue(mockQueue);

	mockResponse.awaitMessageComponent.mockRejectedValue(
		new Error('Component collection timed out'),
	);

	await tempoCommandHandler(interaction);
});
