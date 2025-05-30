import type { Client } from 'discord.js';
import { beforeEach, expect, it, vi } from 'vitest';
import * as botInitialization from '../utils/initializeBot';

vi.mock('../utils/instrument', () => ({}));

vi.mock('../utils/initializeBot', () => ({
	initializeBot: vi.fn(),
}));

const mockedInitializeBot = vi.mocked(botInitialization.initializeBot);

beforeEach(() => {
	vi.clearAllMocks();
});

it('should call `initializeBot`', async () => {
	mockedInitializeBot.mockResolvedValue({
		client: {} as Client,
		token: 'test-token',
	});

	await import('../index');

	expect(mockedInitializeBot).toHaveBeenCalledOnce();
});
