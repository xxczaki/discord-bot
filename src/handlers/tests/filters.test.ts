import { ActionRowBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { useMainPlayer, useQueue } from 'discord-player';
import { beforeEach, expect, it, vi } from 'vitest';
import filtersCommandHandler from '../filters';

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
				filters: [...activeFilters, '_normalizer'], // include custom filter to test exclusion
				toggle: vi.fn().mockResolvedValue(undefined),
			},
		},
	} as unknown as NonNullable<ReturnType<typeof useQueue>>;
}

function createMockComponent(
	componentType: 'button' | 'selectMenu',
	values: string[] = [],
) {
	return {
		isButton: () => componentType === 'button',
		isStringSelectMenu: () => componentType === 'selectMenu',
		values,
		reply: vi.fn().mockResolvedValue(undefined),
		editReply: vi.fn().mockResolvedValue(undefined),
	};
}

it('should create correct select menu and cancel button', async () => {
	const interaction = createMockInteraction();
	const mockResponse = createMockResponse();
	const mockQueue = createMockQueue([]);

	interaction.reply = vi.fn().mockResolvedValue(mockResponse);
	mockedUseQueue.mockReturnValue(mockQueue);

	mockResponse.awaitMessageComponent.mockRejectedValue(new Error('timeout'));

	await filtersCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith({
		content: 'Choose which filters you want to toggle:',
		components: expect.arrayContaining([
			expect.any(ActionRowBuilder),
			expect.any(ActionRowBuilder),
		]),
		flags: ['Ephemeral'],
	});
});

it('should exclude custom filters from active filters list', async () => {
	const interaction = createMockInteraction();
	const mockResponse = createMockResponse();

	const mockQueue = createMockQueue(['bassboost', '_normalizer', '_tempo125']);

	interaction.reply = vi.fn().mockResolvedValue(mockResponse);
	mockedUseQueue.mockReturnValue(mockQueue);

	mockResponse.awaitMessageComponent.mockRejectedValue(new Error('timeout'));

	await filtersCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalled();
});

it('should handle cancel button press', async () => {
	const interaction = createMockInteraction();
	const mockResponse = createMockResponse();
	const mockQueue = createMockQueue([]);

	interaction.reply = vi.fn().mockResolvedValue(mockResponse);
	mockedUseQueue.mockReturnValue(mockQueue);

	const mockComponent = createMockComponent('button');
	mockResponse.awaitMessageComponent.mockResolvedValue(mockComponent);

	await filtersCommandHandler(interaction);

	expect(mockResponse.delete).toHaveBeenCalled();
});

it('should toggle new filters and disable unselected active ones', async () => {
	const interaction = createMockInteraction();
	const mockResponse = createMockResponse();
	const mockQueue = createMockQueue(['bassboost']);

	interaction.reply = vi.fn().mockResolvedValue(mockResponse);
	mockedUseQueue.mockReturnValue(mockQueue);

	const selectedValues = ['nightcore', 'lofi'];
	const mockComponent = createMockComponent('selectMenu', selectedValues);
	mockResponse.awaitMessageComponent.mockResolvedValue(mockComponent);

	await filtersCommandHandler(interaction);

	expect(mockQueue.filters.ffmpeg.toggle).toHaveBeenCalledWith([
		'nightcore',
		'lofi',
		'bassboost',
	]);

	expect(mockComponent.reply).toHaveBeenCalledWith({
		content: 'Toggling the selected filters…',
		components: [],
	});

	expect(mockComponent.editReply).toHaveBeenCalledWith({
		content: 'The selected filters were toggled.',
		components: [],
	});

	expect(mockResponse.delete).toHaveBeenCalled();
});

it('should disable only unselected active filters', async () => {
	const interaction = createMockInteraction();
	const mockResponse = createMockResponse();
	const mockQueue = createMockQueue(['bassboost', 'lofi']);

	interaction.reply = vi.fn().mockResolvedValue(mockResponse);
	mockedUseQueue.mockReturnValue(mockQueue);

	const selectedValues = ['bassboost'];
	const mockComponent = createMockComponent('selectMenu', selectedValues);
	mockResponse.awaitMessageComponent.mockResolvedValue(mockComponent);

	await filtersCommandHandler(interaction);

	expect(mockQueue.filters.ffmpeg.toggle).toHaveBeenCalledWith(['lofi']);
});

it('should handle no filters selected by disabling all active ones', async () => {
	const interaction = createMockInteraction();
	const mockResponse = createMockResponse();
	const mockQueue = createMockQueue(['bassboost']);

	interaction.reply = vi.fn().mockResolvedValue(mockResponse);
	mockedUseQueue.mockReturnValue(mockQueue);

	const selectedValues: string[] = []; // No filters selected
	const mockComponent = createMockComponent('selectMenu', selectedValues);
	mockResponse.awaitMessageComponent.mockResolvedValue(mockComponent);

	await filtersCommandHandler(interaction);

	expect(mockQueue.filters.ffmpeg.toggle).toHaveBeenCalledWith(['bassboost']);
});

it('should handle timeout gracefully', async () => {
	const interaction = createMockInteraction();
	const mockResponse = createMockResponse();
	const mockQueue = createMockQueue([]);

	interaction.reply = vi.fn().mockResolvedValue(mockResponse);
	mockedUseQueue.mockReturnValue(mockQueue);

	mockResponse.awaitMessageComponent.mockRejectedValue(new Error('timeout'));

	await filtersCommandHandler(interaction);
});

it('should work when no queue is available', async () => {
	const interaction = createMockInteraction();
	const mockResponse = createMockResponse();

	interaction.reply = vi.fn().mockResolvedValue(mockResponse);
	mockedUseQueue.mockReturnValue(null);

	await filtersCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith({
		content: 'No music is currently playing.',
		flags: ['Ephemeral'],
	});
});

it('should handle filters when queue is null', async () => {
	const interaction = createMockInteraction();
	const mockResponse = createMockResponse();

	interaction.reply = vi.fn().mockResolvedValue(mockResponse);
	mockedUseQueue.mockReturnValue(null);

	await filtersCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith({
		content: 'No music is currently playing.',
		flags: ['Ephemeral'],
	});
});

it('should handle complex multi-filter toggle scenario', async () => {
	const interaction = createMockInteraction();
	const mockResponse = createMockResponse();
	const activeFilters = ['bassboost', 'lofi', 'tremolo'];
	const mockQueue = createMockQueue(activeFilters);

	interaction.reply = vi.fn().mockResolvedValue(mockResponse);
	mockedUseQueue.mockReturnValue(mockQueue);

	const selectedValues = ['bassboost', 'nightcore', '8D'];
	const mockComponent = createMockComponent('selectMenu', selectedValues);
	mockResponse.awaitMessageComponent.mockResolvedValue(mockComponent);

	await filtersCommandHandler(interaction);

	const expectedToToggle = ['nightcore', '8D', 'lofi', 'tremolo'];
	expect(mockQueue.filters.ffmpeg.toggle).toHaveBeenCalledWith(
		expectedToToggle,
	);
});

it('should handle unknown component type gracefully', async () => {
	const interaction = createMockInteraction();
	const mockResponse = createMockResponse();
	const mockQueue = createMockQueue([]);

	interaction.reply = vi.fn().mockResolvedValue(mockResponse);
	mockedUseQueue.mockReturnValue(mockQueue);

	const mockComponent = {
		isButton: () => false,
		isStringSelectMenu: () => false,
		editReply: vi.fn().mockResolvedValue(undefined),
	};

	mockResponse.awaitMessageComponent.mockResolvedValue(mockComponent);

	await filtersCommandHandler(interaction);

	expect(mockResponse.delete).toHaveBeenCalled();
	expect(mockComponent.editReply).toHaveBeenCalledWith({
		content: 'No filters were selected, aborting…',
		components: [],
	});
});
