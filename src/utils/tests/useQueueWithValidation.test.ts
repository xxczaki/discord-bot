import type { ChatInputCommandInteraction } from 'discord.js';
import type { GuildQueue } from 'discord-player';
import { useQueue } from 'discord-player';
import { beforeEach, expect, it, vi } from 'vitest';
import useQueueWithValidation from '../useQueueWithValidation';

const MOCK_QUEUE = { id: 'test-queue' } as GuildQueue;

vi.mock('discord-player', () => ({
	useQueue: vi.fn(),
}));

const createMockInteraction = () =>
	({
		reply: vi.fn().mockResolvedValue(undefined),
		editReply: vi.fn().mockResolvedValue(undefined),
	}) as unknown as ChatInputCommandInteraction;

beforeEach(() => {
	vi.clearAllMocks();
});

it('should return queue when useQueue returns a valid queue', () => {
	vi.mocked(useQueue).mockReturnValue(MOCK_QUEUE);
	const mockInteraction = createMockInteraction();

	const result = useQueueWithValidation(mockInteraction);

	expect(result).toBe(MOCK_QUEUE);
	expect(mockInteraction.reply).not.toHaveBeenCalled();
});

it('should return null and reply with default message when queue is null', () => {
	vi.mocked(useQueue).mockReturnValue(null);
	const mockInteraction = createMockInteraction();

	const result = useQueueWithValidation(mockInteraction);

	expect(result).toBeNull();
	expect(mockInteraction.reply).toHaveBeenCalledWith({
		content: 'No music is currently playing.',
		flags: ['Ephemeral'],
	});
});

it('should return null and reply with custom message when queue is null', () => {
	vi.mocked(useQueue).mockReturnValue(null);
	const mockInteraction = createMockInteraction();

	const result = useQueueWithValidation(mockInteraction, {
		message: 'Custom error message',
	});

	expect(result).toBeNull();
	expect(mockInteraction.reply).toHaveBeenCalledWith({
		content: 'Custom error message',
		flags: ['Ephemeral'],
	});
});

it('should use `editReply` when `deferred` option is true', () => {
	vi.mocked(useQueue).mockReturnValue(null);
	const mockInteraction = createMockInteraction();

	const result = useQueueWithValidation(mockInteraction, {
		deferred: true,
	});

	expect(result).toBeNull();
	expect(mockInteraction.editReply).toHaveBeenCalledWith(
		'No music is currently playing.',
	);
	expect(mockInteraction.reply).not.toHaveBeenCalled();
});
