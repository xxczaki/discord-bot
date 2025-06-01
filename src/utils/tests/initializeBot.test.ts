import type { Player } from 'discord-player';
import type { Client } from 'discord.js';
import { beforeEach, expect, it, vi } from 'vitest';
import useDebugListeners from '../../hooks/useDebugListeners';
import useDiscordEventHandlers, {
	useReadyEventHandler,
} from '../../hooks/useDiscordEventHandlers';
import usePlayerEventHandlers from '../../hooks/usePlayerEventHandlers';
import { createDiscordClient } from '../createDiscordClient';
import getEnvironmentVariable from '../getEnvironmentVariable';
import { initializeBot } from '../initializeBot';
import initializeCommands from '../initializeCommands';
import getInitializedPlayer from '../initializePlayer';

vi.mock('../createDiscordClient');
vi.mock('../getEnvironmentVariable');
vi.mock('../initializeCommands');
vi.mock('../initializePlayer');
vi.mock('../../hooks/useDebugListeners');
vi.mock('../../hooks/useDiscordEventHandlers');
vi.mock('../../hooks/usePlayerEventHandlers');

vi.mock('discord-player-youtubei', () => ({
	YoutubeiExtractor: vi.fn(),
}));

const mockedCreateDiscordClient = vi.mocked(createDiscordClient);
const mockedGetEnvironmentVariable = vi.mocked(getEnvironmentVariable);
const mockedInitializeCommands = vi.mocked(initializeCommands);
const mockedGetInitializedPlayer = vi.mocked(getInitializedPlayer);
const mockedUseDebugListeners = vi.mocked(useDebugListeners);
const mockedUseDiscordEventHandlers = vi.mocked(useDiscordEventHandlers);
const mockedUseReadyEventHandler = vi.mocked(useReadyEventHandler);
const mockedUsePlayerEventHandlers = vi.mocked(usePlayerEventHandlers);

function createMockClient(): Client {
	return {
		login: vi.fn().mockResolvedValue('mocked-token'),
	} as unknown as Client;
}

function createMockPlayer(): Player {
	return {
		events: { on: vi.fn() },
	} as unknown as Player;
}

beforeEach(() => {
	vi.clearAllMocks();
});

it('should initialize bot components in correct order', async () => {
	const mockClient = createMockClient();
	const mockPlayer = createMockPlayer();
	const mockToken = 'test-token';

	mockedCreateDiscordClient.mockReturnValue(mockClient);
	mockedGetEnvironmentVariable.mockReturnValue(mockToken);
	mockedGetInitializedPlayer.mockResolvedValue(mockPlayer);

	const result = await initializeBot();

	const debugListenersCall =
		mockedUseDebugListeners.mock.invocationCallOrder[0];
	const readyEventHandlerCall =
		mockedUseReadyEventHandler.mock.invocationCallOrder[0];
	const loginCall = (mockClient.login as ReturnType<typeof vi.fn>).mock
		.invocationCallOrder[0];
	const playerInitCall = mockedGetInitializedPlayer.mock.invocationCallOrder[0];
	const discordEventHandlersCall =
		mockedUseDiscordEventHandlers.mock.invocationCallOrder[0];
	const playerEventHandlersCall =
		mockedUsePlayerEventHandlers.mock.invocationCallOrder[0];

	expect(debugListenersCall).toBeLessThan(loginCall);
	expect(readyEventHandlerCall).toBeLessThan(loginCall);

	expect(loginCall).toBeLessThan(playerInitCall);
	expect(loginCall).toBeLessThan(discordEventHandlersCall);
	expect(loginCall).toBeLessThan(playerEventHandlersCall);

	expect(playerInitCall).toBeLessThan(discordEventHandlersCall);
	expect(playerInitCall).toBeLessThan(playerEventHandlersCall);

	expect(mockedInitializeCommands).toHaveBeenCalledOnce();
	expect(mockedCreateDiscordClient).toHaveBeenCalledOnce();
	expect(mockedGetEnvironmentVariable).toHaveBeenCalledWith('TOKEN');
	expect(mockedUseDebugListeners).toHaveBeenCalledWith(mockClient);
	expect(mockedUseReadyEventHandler).toHaveBeenCalledWith(mockClient);
	expect(mockClient.login).toHaveBeenCalledWith(mockToken);
	expect(mockedGetInitializedPlayer).toHaveBeenCalledWith(mockClient);
	expect(mockedUseDiscordEventHandlers).toHaveBeenCalledWith(
		mockClient,
		mockPlayer,
	);
	expect(mockedUsePlayerEventHandlers).toHaveBeenCalledWith(
		mockClient,
		mockPlayer,
	);

	expect(result).toEqual({ client: mockClient, token: mockToken });
});

it('should handle initialization errors gracefully', async () => {
	const mockClient = createMockClient();
	const mockToken = 'test-token';

	mockedCreateDiscordClient.mockReturnValue(mockClient);
	mockedGetEnvironmentVariable.mockReturnValue(mockToken);
	(mockClient.login as ReturnType<typeof vi.fn>).mockRejectedValue(
		new Error('Login failed'),
	);

	await expect(initializeBot()).rejects.toThrow('Login failed');

	expect(mockedUseDebugListeners).toHaveBeenCalledWith(mockClient);
	expect(mockedUseReadyEventHandler).toHaveBeenCalledWith(mockClient);
	expect(mockClient.login).toHaveBeenCalledWith(mockToken);
	expect(mockedGetInitializedPlayer).not.toHaveBeenCalled();
	expect(mockedUseDiscordEventHandlers).not.toHaveBeenCalled();
	expect(mockedUsePlayerEventHandlers).not.toHaveBeenCalled();
});
