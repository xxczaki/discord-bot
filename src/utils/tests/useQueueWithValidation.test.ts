import type { ChatInputCommandInteraction } from 'discord.js';
import type { GuildQueue } from 'discord-player';
import { expect, it, vi } from 'vitest';
import useQueueWithValidation from '../useQueueWithValidation';

const MOCK_QUEUE = { id: 'test-queue' } as GuildQueue;

vi.mock('discord-player', () => ({
	useQueue: vi.fn(),
}));

const mockInteraction = {
	reply: vi.fn().mockResolvedValue(undefined),
} as unknown as ChatInputCommandInteraction;

it('should return queue when useQueue returns a valid queue', async () => {
	const { useQueue } = await import('discord-player');
	vi.mocked(useQueue).mockReturnValue(MOCK_QUEUE);

	const result = useQueueWithValidation(mockInteraction);

	expect(result).toBe(MOCK_QUEUE);
	expect(mockInteraction.reply).not.toHaveBeenCalled();
});

it('should return null and reply with default message when queue is null', async () => {
	const { useQueue } = await import('discord-player');
	vi.mocked(useQueue).mockReturnValue(null);

	const result = useQueueWithValidation(mockInteraction);

	expect(result).toBeNull();
	expect(mockInteraction.reply).toHaveBeenCalledWith({
		content: 'No music is currently playing.',
		flags: ['Ephemeral'],
	});
});

it('should return null and reply with custom message when queue is null', async () => {
	const { useQueue } = await import('discord-player');
	vi.mocked(useQueue).mockReturnValue(null);
	const customMessage = 'Custom error message';

	const result = useQueueWithValidation(mockInteraction, customMessage);

	expect(result).toBeNull();
	expect(mockInteraction.reply).toHaveBeenCalledWith({
		content: customMessage,
		flags: ['Ephemeral'],
	});
});
