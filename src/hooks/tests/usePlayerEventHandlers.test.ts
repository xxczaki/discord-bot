import type { GuildQueue, Player, Track } from 'discord-player';
import {
	ActivityType,
	ButtonStyle,
	type Client,
	type Interaction,
	type MessageComponentInteraction,
	PresenceUpdateStatus,
	type TextChannel,
} from 'discord.js';
import { beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS } from '../../constants/miscellaneous';
import { QueueRecoveryService } from '../../utils/QueueRecoveryService';
import { StatsHandler } from '../../utils/StatsHandler';
import createTrackEmbed from '../../utils/createTrackEmbed';
import deleteOpusCacheEntry from '../../utils/deleteOpusCacheEntry';
import resetPresence from '../../utils/resetPresence';
import usePlayerEventHandlers from '../usePlayerEventHandlers';

const MOCK_TRACK_TITLE = 'Test Song';
const MOCK_TRACK_AUTHOR = 'Test Artist';
const MOCK_TRACK_URL = 'https://example.com/track';
const MOCK_USER_ID = '123456789';

vi.mock('../../utils/QueueRecoveryService', () => ({
	QueueRecoveryService: {
		getInstance: vi.fn().mockReturnValue({
			saveQueue: vi.fn(),
			deleteQueue: vi.fn(),
		}),
	},
}));

vi.mock('../../utils/StatsHandler', () => ({
	StatsHandler: {
		getInstance: vi.fn().mockReturnValue({
			saveStat: vi.fn(),
		}),
	},
}));

vi.mock('../../utils/createTrackEmbed', () => ({
	default: vi.fn().mockReturnValue({ title: 'Mock Embed' }),
}));

vi.mock('../../utils/deleteOpusCacheEntry', () => ({
	default: vi.fn(),
}));

vi.mock('../../utils/resetPresence', () => ({
	default: vi.fn(),
}));

const mockedQueueRecoveryService = vi.mocked(
	QueueRecoveryService.getInstance(),
);
const mockedStatsHandler = vi.mocked(StatsHandler.getInstance());
const mockedCreateTrackEmbed = vi.mocked(createTrackEmbed);
const mockedDeleteOpusCacheEntry = vi.mocked(deleteOpusCacheEntry);
const mockedResetPresence = vi.mocked(resetPresence);

beforeEach(() => {
	vi.clearAllMocks();
});

function createMockClient(): Client {
	return {
		user: {
			setPresence: vi.fn(),
		},
	} as unknown as Client;
}

function createMockPlayer(): Player {
	return {
		events: {
			on: vi.fn(),
		},
	} as unknown as Player;
}

function createMockChannel(): TextChannel {
	return {
		send: vi.fn().mockResolvedValue({
			awaitMessageComponent: vi.fn(),
			edit: vi.fn(),
		}),
	} as unknown as TextChannel;
}

function createMockInteraction(): Interaction {
	return {
		channel: createMockChannel(),
	} as unknown as Interaction;
}

function createMockQueue(): GuildQueue {
	return {
		metadata: {
			interaction: createMockInteraction(),
		},
		node: {
			skip: vi.fn(),
		},
	} as unknown as GuildQueue;
}

function createMockTrack(overrides = {}): Track {
	return {
		title: MOCK_TRACK_TITLE,
		author: MOCK_TRACK_AUTHOR,
		url: MOCK_TRACK_URL,
		requestedBy: {
			id: MOCK_USER_ID,
		},
		metadata: {},
		...overrides,
	} as unknown as Track;
}

function createMockMessageComponentInteraction(): MessageComponentInteraction {
	return {
		customId: 'skip',
		update: vi.fn(),
	} as unknown as MessageComponentInteraction;
}

it('should register all player event handlers', () => {
	const mockClient = createMockClient();
	const mockPlayer = createMockPlayer();

	usePlayerEventHandlers(mockClient, mockPlayer);

	expect(mockPlayer.events.on).toHaveBeenCalledWith(
		'playerStart',
		expect.any(Function),
	);
	expect(mockPlayer.events.on).toHaveBeenCalledWith(
		'emptyQueue',
		expect.any(Function),
	);
	expect(mockPlayer.events.on).toHaveBeenCalledWith(
		'queueDelete',
		expect.any(Function),
	);
	expect(mockPlayer.events.on).toHaveBeenCalledWith(
		'playerSkip',
		expect.any(Function),
	);
});

it('should handle `playerStart` event with track embed and skip button', async () => {
	const mockClient = createMockClient();
	const mockPlayer = createMockPlayer();
	const mockQueue = createMockQueue();
	const mockTrack = createMockTrack();
	const mockChannel = createMockChannel();

	(mockQueue.metadata.interaction.channel as TextChannel) = mockChannel;

	usePlayerEventHandlers(mockClient, mockPlayer);

	const playerStartHandler = (
		mockPlayer.events.on as ReturnType<typeof vi.fn>
	).mock.calls.find((call) => call[0] === 'playerStart')?.[1];

	await playerStartHandler(mockQueue, mockTrack);

	expect(mockedCreateTrackEmbed).toHaveBeenCalledWith(
		mockQueue,
		mockTrack,
		'Playing it now.',
	);

	expect(mockChannel.send).toHaveBeenCalledWith({
		embeds: [{ title: 'Mock Embed' }],
		components: [
			expect.objectContaining({
				components: expect.arrayContaining([
					expect.objectContaining({
						data: expect.objectContaining({
							custom_id: 'skip',
							label: 'Skip',
							style: ButtonStyle.Danger,
						}),
					}),
				]),
			}),
		],
	});
});

it('should set client presence when track starts playing', async () => {
	const mockClient = createMockClient();
	const mockPlayer = createMockPlayer();
	const mockQueue = createMockQueue();
	const mockTrack = createMockTrack();

	usePlayerEventHandlers(mockClient, mockPlayer);

	const playerStartHandler = (
		mockPlayer.events.on as ReturnType<typeof vi.fn>
	).mock.calls.find((call) => call[0] === 'playerStart')?.[1];

	await playerStartHandler(mockQueue, mockTrack);

	expect(mockClient.user?.setPresence).toHaveBeenCalledWith({
		activities: [
			{
				name: `"${MOCK_TRACK_TITLE}" by ${MOCK_TRACK_AUTHOR}`,
				type: ActivityType.Listening,
				url: MOCK_TRACK_URL,
			},
		],
		status: PresenceUpdateStatus.Online,
	});
});

it('should save queue to recovery service when track starts', async () => {
	const mockClient = createMockClient();
	const mockPlayer = createMockPlayer();
	const mockQueue = createMockQueue();
	const mockTrack = createMockTrack();

	usePlayerEventHandlers(mockClient, mockPlayer);

	const playerStartHandler = (
		mockPlayer.events.on as ReturnType<typeof vi.fn>
	).mock.calls.find((call) => call[0] === 'playerStart')?.[1];

	await playerStartHandler(mockQueue, mockTrack);

	expect(mockedQueueRecoveryService.saveQueue).toHaveBeenCalledWith(mockQueue);
});

it('should handle skip button interaction and skip track', async () => {
	const mockClient = createMockClient();
	const mockPlayer = createMockPlayer();
	const mockQueue = createMockQueue();
	const mockTrack = createMockTrack();
	const mockChannel = createMockChannel();
	const mockResponse = {
		awaitMessageComponent: vi.fn(),
		edit: vi.fn(),
	};
	const mockComponentInteraction = createMockMessageComponentInteraction();

	(mockQueue.metadata.interaction.channel as TextChannel) = mockChannel;
	(mockChannel.send as ReturnType<typeof vi.fn>).mockResolvedValue(
		mockResponse,
	);
	mockResponse.awaitMessageComponent.mockResolvedValue(
		mockComponentInteraction,
	);

	usePlayerEventHandlers(mockClient, mockPlayer);

	const playerStartHandler = (
		mockPlayer.events.on as ReturnType<typeof vi.fn>
	).mock.calls.find((call) => call[0] === 'playerStart')?.[1];

	await playerStartHandler(mockQueue, mockTrack);

	expect(mockResponse.awaitMessageComponent).toHaveBeenCalledWith({
		time: DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS,
	});
	expect(mockQueue.node.skip).toHaveBeenCalled();
	expect(mockComponentInteraction.update).toHaveBeenCalledWith({
		content: 'Track skipped.',
		embeds: [],
		components: [],
	});
});

it('should remove components when skip button times out', async () => {
	const mockClient = createMockClient();
	const mockPlayer = createMockPlayer();
	const mockQueue = createMockQueue();
	const mockTrack = createMockTrack();
	const mockChannel = createMockChannel();
	const mockResponse = {
		awaitMessageComponent: vi.fn(),
		edit: vi.fn(),
	};

	(mockQueue.metadata.interaction.channel as TextChannel) = mockChannel;
	(mockChannel.send as ReturnType<typeof vi.fn>).mockResolvedValue(
		mockResponse,
	);
	mockResponse.awaitMessageComponent.mockRejectedValue(
		new Error('Interaction timeout'),
	);

	usePlayerEventHandlers(mockClient, mockPlayer);

	const playerStartHandler = (
		mockPlayer.events.on as ReturnType<typeof vi.fn>
	).mock.calls.find((call) => call[0] === 'playerStart')?.[1];

	await playerStartHandler(mockQueue, mockTrack);

	expect(mockResponse.edit).toHaveBeenCalledWith({
		components: [],
	});
});

it('should save play stats when skip button times out', async () => {
	const mockClient = createMockClient();
	const mockPlayer = createMockPlayer();
	const mockQueue = createMockQueue();
	const mockTrack = createMockTrack();
	const mockChannel = createMockChannel();
	const mockResponse = {
		awaitMessageComponent: vi.fn(),
		edit: vi.fn(),
	};

	(mockQueue.metadata.interaction.channel as TextChannel) = mockChannel;
	(mockChannel.send as ReturnType<typeof vi.fn>).mockResolvedValue(
		mockResponse,
	);
	mockResponse.awaitMessageComponent.mockRejectedValue(
		new Error('Interaction timeout'),
	);

	usePlayerEventHandlers(mockClient, mockPlayer);

	const playerStartHandler = (
		mockPlayer.events.on as ReturnType<typeof vi.fn>
	).mock.calls.find((call) => call[0] === 'playerStart')?.[1];

	await playerStartHandler(mockQueue, mockTrack);

	expect(mockedStatsHandler.saveStat).toHaveBeenCalledWith('play', {
		title: MOCK_TRACK_TITLE,
		author: MOCK_TRACK_AUTHOR,
		requestedById: MOCK_USER_ID,
	});
});

it('should save play stats without `requestedById` when track has no requester', async () => {
	const mockClient = createMockClient();
	const mockPlayer = createMockPlayer();
	const mockQueue = createMockQueue();
	const mockTrack = createMockTrack({ requestedBy: null });
	const mockChannel = createMockChannel();
	const mockResponse = {
		awaitMessageComponent: vi.fn(),
		edit: vi.fn(),
	};

	(mockQueue.metadata.interaction.channel as TextChannel) = mockChannel;
	(mockChannel.send as ReturnType<typeof vi.fn>).mockResolvedValue(
		mockResponse,
	);
	mockResponse.awaitMessageComponent.mockRejectedValue(
		new Error('Interaction timeout'),
	);

	usePlayerEventHandlers(mockClient, mockPlayer);

	const playerStartHandler = (
		mockPlayer.events.on as ReturnType<typeof vi.fn>
	).mock.calls.find((call) => call[0] === 'playerStart')?.[1];

	await playerStartHandler(mockQueue, mockTrack);

	expect(mockedStatsHandler.saveStat).toHaveBeenCalledWith('play', {
		title: MOCK_TRACK_TITLE,
		author: MOCK_TRACK_AUTHOR,
		requestedById: undefined,
	});
});

it('should handle `emptyQueue` event by sending message and resetting presence', async () => {
	const mockClient = createMockClient();
	const mockPlayer = createMockPlayer();
	const mockQueue = createMockQueue();
	const mockChannel = createMockChannel();

	(mockQueue.metadata.interaction.channel as TextChannel) = mockChannel;

	usePlayerEventHandlers(mockClient, mockPlayer);

	const emptyQueueHandler = (
		mockPlayer.events.on as ReturnType<typeof vi.fn>
	).mock.calls.find((call) => call[0] === 'emptyQueue')?.[1];

	await emptyQueueHandler(mockQueue);

	expect(mockChannel.send).toHaveBeenCalledWith('Queue finished, leaving…');
	expect(mockedQueueRecoveryService.deleteQueue).toHaveBeenCalled();
	expect(mockedResetPresence).toHaveBeenCalledWith(mockClient);
});

it('should handle `queueDelete` event by resetting presence', async () => {
	const mockClient = createMockClient();
	const mockPlayer = createMockPlayer();

	usePlayerEventHandlers(mockClient, mockPlayer);

	const queueDeleteHandler = (
		mockPlayer.events.on as ReturnType<typeof vi.fn>
	).mock.calls.find((call) => call[0] === 'queueDelete')?.[1];

	await queueDeleteHandler();

	expect(mockedResetPresence).toHaveBeenCalledWith(mockClient);
});

it('should handle `playerSkip` event and delete opus cache entry for non-cached tracks', async () => {
	const mockClient = createMockClient();
	const mockPlayer = createMockPlayer();
	const mockQueue = createMockQueue();
	const mockTrack = createMockTrack();

	usePlayerEventHandlers(mockClient, mockPlayer);

	const playerSkipHandler = (
		mockPlayer.events.on as ReturnType<typeof vi.fn>
	).mock.calls.find((call) => call[0] === 'playerSkip')?.[1];

	await playerSkipHandler(mockQueue, mockTrack);

	expect(mockedDeleteOpusCacheEntry).toHaveBeenCalledWith(MOCK_TRACK_URL);
});

it('should not delete opus cache entry for cached tracks on `playerSkip`', async () => {
	const mockClient = createMockClient();
	const mockPlayer = createMockPlayer();
	const mockQueue = createMockQueue();
	const mockTrack = createMockTrack({
		metadata: { isFromCache: true },
	});

	usePlayerEventHandlers(mockClient, mockPlayer);

	const playerSkipHandler = (
		mockPlayer.events.on as ReturnType<typeof vi.fn>
	).mock.calls.find((call) => call[0] === 'playerSkip')?.[1];

	await playerSkipHandler(mockQueue, mockTrack);

	expect(mockedDeleteOpusCacheEntry).not.toHaveBeenCalled();
});

it('should not delete opus cache entry when track metadata is not an object', async () => {
	const mockClient = createMockClient();
	const mockPlayer = createMockPlayer();
	const mockQueue = createMockQueue();
	const mockTrack = createMockTrack({
		metadata: 'invalid metadata',
	});

	usePlayerEventHandlers(mockClient, mockPlayer);

	const playerSkipHandler = (
		mockPlayer.events.on as ReturnType<typeof vi.fn>
	).mock.calls.find((call) => call[0] === 'playerSkip')?.[1];

	await playerSkipHandler(mockQueue, mockTrack);

	expect(mockedDeleteOpusCacheEntry).toHaveBeenCalledWith(MOCK_TRACK_URL);
});

it('should handle unknown button interaction by falling through to catch block', async () => {
	const mockClient = createMockClient();
	const mockPlayer = createMockPlayer();
	const mockQueue = createMockQueue();
	const mockTrack = createMockTrack();
	const mockChannel = createMockChannel();
	const mockResponse = {
		awaitMessageComponent: vi.fn(),
		edit: vi.fn(),
	};
	const mockComponentInteraction = {
		customId: 'unknown',
		update: vi.fn(),
	};

	(mockQueue.metadata.interaction.channel as TextChannel) = mockChannel;
	(mockChannel.send as ReturnType<typeof vi.fn>).mockResolvedValue(
		mockResponse,
	);
	mockResponse.awaitMessageComponent.mockResolvedValue(
		mockComponentInteraction,
	);

	usePlayerEventHandlers(mockClient, mockPlayer);

	const playerStartHandler = (
		mockPlayer.events.on as ReturnType<typeof vi.fn>
	).mock.calls.find((call) => call[0] === 'playerStart')?.[1];

	await playerStartHandler(mockQueue, mockTrack);

	expect(mockResponse.edit).toHaveBeenCalledWith({
		components: [],
	});
	expect(mockedStatsHandler.saveStat).toHaveBeenCalledWith('play', {
		title: MOCK_TRACK_TITLE,
		author: MOCK_TRACK_AUTHOR,
		requestedById: MOCK_USER_ID,
	});
});
