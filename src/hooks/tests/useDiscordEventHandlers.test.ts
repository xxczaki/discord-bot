import type {
	Client,
	Guild,
	Interaction,
	TextChannel,
	VoiceState,
} from 'discord.js';
import type { Player, Track } from 'discord-player';
import { useQueue } from 'discord-player';
import { beforeEach, expect, it, vi } from 'vitest';
import deleteOpusCacheEntry from '../../utils/deleteOpusCacheEntry';
import getCommitLink from '../../utils/getCommitLink';
import getDeploymentVersion from '../../utils/getDeploymentVersion';
import useDiscordEventHandlers, {
	useReadyEventHandler,
} from '../useDiscordEventHandlers';

const MOCK_GUILD_ID = '123456789';
const MOCK_COMMIT_SHA = 'abc123def456';

vi.mock('discord-player', () => ({
	useQueue: vi.fn(),
}));

vi.mock('../useAutocompleteHandler', () => ({
	default: vi.fn(),
}));

vi.mock('../useCommandHandlers', () => ({
	default: vi.fn(),
}));

vi.mock('../../utils/deleteOpusCacheEntry', () => ({
	default: vi.fn(),
}));

vi.mock('../../utils/QueueRecoveryService', () => ({
	QueueRecoveryService: {
		getInstance: vi.fn().mockReturnValue({
			saveQueue: vi.fn(),
		}),
	},
}));

vi.mock('../../utils/getEnvironmentVariable', () => ({
	default: vi.fn().mockReturnValue('mocked-channel-id'),
}));

vi.mock('../../utils/getDeploymentVersion', () => ({
	default: vi.fn(),
}));

vi.mock('../../utils/getCommitLink', () => ({
	default: vi.fn(),
}));

const mockedUseQueue = vi.mocked(useQueue);
const mockedDeleteOpusCacheEntry = vi.mocked(deleteOpusCacheEntry);
const mockedGetDeploymentVersion = vi.mocked(getDeploymentVersion);
const mockedGetCommitLink = vi.mocked(getCommitLink);

beforeEach(() => {
	vi.clearAllMocks();
	process.env.GIT_COMMIT_SHA = MOCK_COMMIT_SHA;

	mockedGetDeploymentVersion.mockResolvedValue('0.14.0');
	mockedGetCommitLink.mockReturnValue(
		'[`abc123def456`](https://github.com/xxczaki/discord-bot/commit/abc123def456)',
	);
});

function createMockClient(): Client {
	return {
		on: vi.fn(),
		user: {
			tag: 'TestBot#1234',
		},
		channels: {
			cache: {
				get: vi.fn(),
			},
		},
	} as unknown as Client;
}

function createMockPlayer(): Player {
	return {
		context: {
			provide: vi.fn(),
		},
	} as unknown as Player;
}

function createMockInteraction(isChatInput = true): Interaction {
	return {
		guild: { id: MOCK_GUILD_ID } as Guild,
		isChatInputCommand: vi.fn().mockReturnValue(isChatInput),
	} as unknown as Interaction;
}

function createMockVoiceState(): VoiceState {
	return {
		guild: { id: MOCK_GUILD_ID },
	} as VoiceState;
}

function createMockChannel(isSendable = true): TextChannel {
	return {
		isSendable: vi.fn().mockReturnValue(isSendable),
		send: vi.fn(),
	} as unknown as TextChannel;
}

it('should register ready event handler on client', () => {
	const mockClient = createMockClient();

	useReadyEventHandler(mockClient);

	expect(mockClient.on).toHaveBeenCalledWith(
		'clientReady',
		expect.any(Function),
	);
});

it('should register interaction and voice state event handlers on client', () => {
	const mockClient = createMockClient();
	const mockPlayer = createMockPlayer();

	useDiscordEventHandlers(mockClient, mockPlayer);

	expect(mockClient.on).toHaveBeenCalledWith(
		'interactionCreate',
		expect.any(Function),
	);
	expect(mockClient.on).toHaveBeenCalledWith(
		'voiceStateUpdate',
		expect.any(Function),
	);
});

it('should send commit message on `clientReady` when channel exists and commit hash is present', async () => {
	const mockChannel = createMockChannel();
	const mockClient = createMockClient();

	(mockClient.channels.cache.get as ReturnType<typeof vi.fn>).mockReturnValue(
		mockChannel,
	);

	useReadyEventHandler(mockClient);

	const mockOnCalls = (mockClient.on as ReturnType<typeof vi.fn>).mock
		.calls as Array<[string, (...args: unknown[]) => void | Promise<void>]>;
	const readyCall = mockOnCalls.find((call) => call[0] === 'clientReady');
	const readyHandler = readyCall?.[1];

	if (readyHandler) {
		await readyHandler();
	}

	expect(mockChannel.send).toHaveBeenCalledWith(
		expect.stringContaining('🎶 Ready to play, running'),
	);
});

it('should not send commit message when deployment is manual', async () => {
	const mockChannel = createMockChannel();
	const mockClient = createMockClient();

	// Clear commit hash to simulate manual deployment
	const originalCommitSha = process.env.GIT_COMMIT_SHA;
	process.env.GIT_COMMIT_SHA = '';

	(mockClient.channels.cache.get as ReturnType<typeof vi.fn>).mockReturnValue(
		mockChannel,
	);

	useReadyEventHandler(mockClient);

	const mockOnCalls = (mockClient.on as ReturnType<typeof vi.fn>).mock
		.calls as Array<[string, (...args: unknown[]) => void | Promise<void>]>;
	const readyCall = mockOnCalls.find((call) => call[0] === 'clientReady');
	const readyHandler = readyCall?.[1];

	if (readyHandler) {
		await readyHandler();
	}

	expect(mockChannel.send).not.toHaveBeenCalled();

	if (originalCommitSha) {
		process.env.GIT_COMMIT_SHA = originalCommitSha;
	}
});

it('should handle `interactionCreate` when guild exists', async () => {
	const mockClient = createMockClient();
	const mockPlayer = createMockPlayer();
	const mockInteraction = createMockInteraction();

	useDiscordEventHandlers(mockClient, mockPlayer);

	const mockOnCalls = (mockClient.on as ReturnType<typeof vi.fn>).mock
		.calls as Array<[string, (...args: unknown[]) => void | Promise<void>]>;
	const interactionCall = mockOnCalls.find(
		(call) => call[0] === 'interactionCreate',
	);
	const interactionHandler = interactionCall?.[1];

	if (interactionHandler) {
		interactionHandler(mockInteraction);
	}

	expect(mockPlayer.context.provide).toHaveBeenCalledWith(
		{ guild: mockInteraction.guild },
		expect.any(Function),
	);
});

it('should throw error when `guild` is not defined in interaction', async () => {
	const mockClient = createMockClient();
	const mockPlayer = createMockPlayer();
	const mockInteraction = { guild: null } as unknown as Interaction;

	useDiscordEventHandlers(mockClient, mockPlayer);

	const mockOnCalls = (mockClient.on as ReturnType<typeof vi.fn>).mock
		.calls as Array<[string, (...args: unknown[]) => void | Promise<void>]>;
	const interactionCall = mockOnCalls.find(
		(call) => call[0] === 'interactionCreate',
	);
	const interactionHandler = interactionCall?.[1];

	if (interactionHandler) {
		await expect(interactionHandler(mockInteraction)).rejects.toThrow(
			'Guild is not defined!',
		);
	}
});

it('should handle `voiceStateUpdate` and save queue', async () => {
	const mockClient = createMockClient();
	const mockPlayer = createMockPlayer();
	const mockVoiceState = createMockVoiceState();
	const mockQueue = {
		currentTrack: null,
	};

	mockedUseQueue.mockReturnValue(mockQueue as ReturnType<typeof useQueue>);

	(mockPlayer.context.provide as ReturnType<typeof vi.fn>).mockImplementation(
		async (_, callback) => {
			await callback();
		},
	);

	useDiscordEventHandlers(mockClient, mockPlayer);

	const mockOnCalls = (mockClient.on as ReturnType<typeof vi.fn>).mock
		.calls as Array<[string, (...args: unknown[]) => void | Promise<void>]>;
	const voiceStateCall = mockOnCalls.find(
		(call) => call[0] === 'voiceStateUpdate',
	);
	const voiceStateHandler = voiceStateCall?.[1];

	if (voiceStateHandler) {
		await voiceStateHandler(mockVoiceState);
	}

	expect(mockPlayer.context.provide).toHaveBeenCalledWith(
		{ guild: mockVoiceState.guild },
		expect.any(Function),
	);
	expect(useQueue).toHaveBeenCalledWith(MOCK_GUILD_ID);
});

it('should delete opus cache when track is not from cache', async () => {
	const mockClient = createMockClient();
	const mockPlayer = createMockPlayer();
	const mockVoiceState = createMockVoiceState();
	const mockTrack = {
		url: 'https://example.com/track.mp3',
		metadata: { isFromCache: false },
	} as Track;
	const mockQueue = {
		currentTrack: mockTrack,
	};

	mockedUseQueue.mockReturnValue(mockQueue as ReturnType<typeof useQueue>);

	(mockPlayer.context.provide as ReturnType<typeof vi.fn>).mockImplementation(
		async (_, callback) => {
			await callback();
		},
	);

	useDiscordEventHandlers(mockClient, mockPlayer);

	const mockOnCalls = (mockClient.on as ReturnType<typeof vi.fn>).mock
		.calls as Array<[string, (...args: unknown[]) => void | Promise<void>]>;
	const voiceStateCall = mockOnCalls.find(
		(call) => call[0] === 'voiceStateUpdate',
	);
	const voiceStateHandler = voiceStateCall?.[1];

	if (voiceStateHandler) {
		await voiceStateHandler(mockVoiceState);
	}

	expect(mockedDeleteOpusCacheEntry).toHaveBeenCalledWith(mockTrack.url);
});

it('should not delete opus cache when track is from cache', async () => {
	const mockClient = createMockClient();
	const mockPlayer = createMockPlayer();
	const mockVoiceState = createMockVoiceState();

	const mockTrack = {
		url: 'https://example.com/track.mp3',
		metadata: { isFromCache: true },
	} as Track;

	const mockQueue = {
		currentTrack: mockTrack,
	};

	mockedUseQueue.mockReturnValue(mockQueue as ReturnType<typeof useQueue>);

	(mockPlayer.context.provide as ReturnType<typeof vi.fn>).mockImplementation(
		async (_, callback) => {
			await callback();
		},
	);

	useDiscordEventHandlers(mockClient, mockPlayer);

	const mockOnCalls = (mockClient.on as ReturnType<typeof vi.fn>).mock
		.calls as Array<[string, (...args: unknown[]) => void | Promise<void>]>;
	const voiceStateCall = mockOnCalls.find(
		(call) => call[0] === 'voiceStateUpdate',
	);
	const voiceStateHandler = voiceStateCall?.[1];

	if (voiceStateHandler) {
		await voiceStateHandler(mockVoiceState);
	}

	expect(mockedDeleteOpusCacheEntry).not.toHaveBeenCalled();
});

it('should send commit link when deployment version is not available', async () => {
	const mockChannel = createMockChannel();
	const mockClient = createMockClient();

	(mockClient.channels.cache.get as ReturnType<typeof vi.fn>).mockReturnValue(
		mockChannel,
	);

	mockedGetDeploymentVersion.mockResolvedValue(undefined);
	mockedGetCommitLink.mockReturnValue(
		'[`abc123def456`](https://github.com/xxczaki/discord-bot/commit/abc123def456)',
	);

	useReadyEventHandler(mockClient);

	const mockOnCalls = (mockClient.on as ReturnType<typeof vi.fn>).mock
		.calls as Array<[string, (...args: unknown[]) => void | Promise<void>]>;
	const readyCall = mockOnCalls.find((call) => call[0] === 'clientReady');
	const readyHandler = readyCall?.[1];

	if (readyHandler) {
		await readyHandler();
	}

	expect(mockChannel.send).toHaveBeenCalledWith(
		expect.stringContaining('🎶 Ready to play, running commit'),
	);
});

it('should handle autocomplete interactions', async () => {
	const mockClient = createMockClient();
	const mockPlayer = createMockPlayer();
	const mockInteraction = {
		guild: { id: MOCK_GUILD_ID } as Guild,
		isAutocomplete: vi.fn().mockReturnValue(true),
		isChatInputCommand: vi.fn().mockReturnValue(false),
	} as unknown as Interaction;

	(mockPlayer.context.provide as ReturnType<typeof vi.fn>).mockImplementation(
		async (_, callback) => {
			await callback();
		},
	);

	useDiscordEventHandlers(mockClient, mockPlayer);

	const mockOnCalls = (mockClient.on as ReturnType<typeof vi.fn>).mock
		.calls as Array<[string, (...args: unknown[]) => void | Promise<void>]>;
	const interactionCall = mockOnCalls.find(
		(call) => call[0] === 'interactionCreate',
	);
	const interactionHandler = interactionCall?.[1];

	if (interactionHandler) {
		interactionHandler(mockInteraction);
	}

	expect(mockInteraction.isAutocomplete).toHaveBeenCalled();
});

it('should handle chat input command interactions', async () => {
	const mockClient = createMockClient();
	const mockPlayer = createMockPlayer();

	const mockInteraction = {
		guild: { id: MOCK_GUILD_ID } as Guild,
		isAutocomplete: vi.fn().mockReturnValue(false),
		isChatInputCommand: vi.fn().mockReturnValue(true),
	} as unknown as Interaction;

	(mockPlayer.context.provide as ReturnType<typeof vi.fn>).mockImplementation(
		async (_, callback) => {
			await callback();
		},
	);

	useDiscordEventHandlers(mockClient, mockPlayer);

	const mockOnCalls = (mockClient.on as ReturnType<typeof vi.fn>).mock
		.calls as Array<[string, (...args: unknown[]) => void | Promise<void>]>;
	const interactionCall = mockOnCalls.find(
		(call) => call[0] === 'interactionCreate',
	);
	const interactionHandler = interactionCall?.[1];

	if (interactionHandler) {
		interactionHandler(mockInteraction);
	}

	expect(mockInteraction.isChatInputCommand).toHaveBeenCalled();
});
