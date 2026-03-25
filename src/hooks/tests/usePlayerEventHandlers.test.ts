import { stat } from 'node:fs/promises';
import {
	ActivityType,
	type ButtonInteraction,
	ButtonStyle,
	type Client,
	type Interaction,
	type MessageComponentInteraction,
	type TextChannel,
} from 'discord.js';
import {
	type GuildQueue,
	type Player,
	type Track,
	TrackSkipReason,
} from 'discord-player';
import { beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS } from '../../constants/miscellaneous';
import createSmartInteractionHandler from '../../utils/createSmartInteractionHandler';
import createTrackEmbed from '../../utils/createTrackEmbed';
import { OpusCacheManager } from '../../utils/OpusCacheManager';
import { resetPresence, setPresence } from '../../utils/presenceManager';
import { QueueRecoveryService } from '../../utils/QueueRecoveryService';
import { StatsHandler } from '../../utils/StatsHandler';
import usePlayerEventHandlers from '../usePlayerEventHandlers';

vi.mock('node:fs/promises', () => ({
	stat: vi.fn(),
}));

vi.mock('pretty-bytes', () => ({
	default: vi.fn().mockReturnValue('1.5 MB'),
}));

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

vi.mock('../../utils/OpusCacheManager', () => ({
	OpusCacheManager: {
		getInstance: vi.fn().mockReturnValue({
			generateFilename: vi.fn().mockReturnValue('mock_filename.opus'),
			getFilePath: vi
				.fn()
				.mockReturnValue('/mock/cache/path/mock_filename.opus'),
			deleteEntry: vi.fn().mockResolvedValue(undefined),
		}),
	},
}));

vi.mock('../../utils/presenceManager', () => ({
	resetPresence: vi.fn(),
	setPresence: vi.fn(),
}));

vi.mock('../../utils/createSmartInteractionHandler', () => ({
	default: vi.fn(),
}));

const mockedQueueRecoveryService = vi.mocked(
	QueueRecoveryService.getInstance(),
);
const mockedStatsHandler = vi.mocked(StatsHandler.getInstance());
const mockedCreateSmartInteractionHandler = vi.mocked(
	createSmartInteractionHandler,
);
const mockedCreateTrackEmbed = vi.mocked(createTrackEmbed);
const mockedOpusCacheManager = vi.mocked(OpusCacheManager);
const mockedResetPresence = vi.mocked(resetPresence);
const mockedSetPresence = vi.mocked(setPresence);

beforeEach(() => {
	vi.clearAllMocks();

	mockedCreateSmartInteractionHandler.mockReturnValue({
		cleanup: vi.fn(),
		timeout: DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS,
	});
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
		sendTyping: vi.fn().mockResolvedValue(undefined),
		isSendable: vi.fn().mockReturnValue(true),
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
			getTimestamp: vi.fn().mockReturnValue(null),
		},
		tracks: {
			find: vi.fn().mockReturnValue(null),
			data: [],
		},
		currentTrack: null,
		guild: {
			id: 'mock-guild-id',
		},
		size: 0,
	} as unknown as GuildQueue;
}

function createMockTrack(overrides = {}): Track {
	return {
		title: MOCK_TRACK_TITLE,
		cleanTitle: MOCK_TRACK_TITLE,
		author: MOCK_TRACK_AUTHOR,
		url: MOCK_TRACK_URL,
		durationMS: 180000,
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

	expect(mockedSetPresence).toHaveBeenCalledWith(mockClient, {
		name: `"${MOCK_TRACK_TITLE}" by ${MOCK_TRACK_AUTHOR}`,
		type: ActivityType.Listening,
		url: MOCK_TRACK_URL,
		status: 'online',
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

it('should handle skip button interaction and show undo button', async () => {
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
	mockResponse.awaitMessageComponent
		.mockResolvedValueOnce(mockComponentInteraction)
		.mockRejectedValueOnce(new Error('timeout'));

	usePlayerEventHandlers(mockClient, mockPlayer);

	const playerStartHandler = (
		mockPlayer.events.on as ReturnType<typeof vi.fn>
	).mock.calls.find((call) => call[0] === 'playerStart')?.[1];

	await playerStartHandler(mockQueue, mockTrack);

	expect(mockQueue.node.skip).toHaveBeenCalled();
	expect(mockedCreateTrackEmbed).toHaveBeenCalledWith(
		mockTrack,
		'⏭️ Track was skipped.',
	);
	expect(mockComponentInteraction.update).toHaveBeenCalledWith({
		content: null,
		embeds: [{ title: 'Mock Embed' }],
		components: [
			expect.objectContaining({
				components: expect.arrayContaining([
					expect.objectContaining({
						data: expect.objectContaining({
							custom_id: 'undo-skip',
							label: 'Undo',
							style: ButtonStyle.Secondary,
						}),
					}),
				]),
			}),
		],
	});
});

it('should undo skip when undo button is clicked', async () => {
	const mockClient = createMockClient();
	const mockPlayer = createMockPlayer();
	const mockQueue = createMockQueue();
	const mockTrack = createMockTrack();
	const mockChannel = createMockChannel();
	const mockUndoInteraction = {
		customId: 'undo-skip',
		update: vi.fn(),
	} as unknown as ButtonInteraction;
	const mockResponse = {
		awaitMessageComponent: vi.fn(),
		edit: vi.fn(),
	};
	const mockComponentInteraction = createMockMessageComponentInteraction();

	(mockQueue as unknown as Record<string, unknown>).history = {
		previous: vi.fn().mockResolvedValue(undefined),
	};

	(mockQueue.metadata.interaction.channel as TextChannel) = mockChannel;
	(mockChannel.send as ReturnType<typeof vi.fn>).mockResolvedValue(
		mockResponse,
	);
	mockResponse.awaitMessageComponent
		.mockResolvedValueOnce(mockComponentInteraction)
		.mockResolvedValueOnce(mockUndoInteraction);

	usePlayerEventHandlers(mockClient, mockPlayer);

	const playerStartHandler = (
		mockPlayer.events.on as ReturnType<typeof vi.fn>
	).mock.calls.find((call) => call[0] === 'playerStart')?.[1];

	await playerStartHandler(mockQueue, mockTrack);

	expect(
		(
			mockQueue as unknown as Record<
				string,
				{ previous: ReturnType<typeof vi.fn> }
			>
		).history.previous,
	).toHaveBeenCalledWith(true);
	expect(mockedCreateTrackEmbed).toHaveBeenCalledWith(
		mockTrack,
		'↩️ Skip was undone.',
	);
	expect(mockUndoInteraction.update).toHaveBeenCalledWith({
		content: null,
		embeds: [{ title: 'Mock Embed' }],
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

	expect(mockedCreateSmartInteractionHandler).toHaveBeenCalledWith({
		response: mockResponse,
		queue: mockQueue,
		track: mockTrack,
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

	await playerSkipHandler(mockQueue, mockTrack, TrackSkipReason.Manual);

	expect(mockedOpusCacheManager.getInstance().deleteEntry).toHaveBeenCalledWith(
		'mock_filename.opus',
	);
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

	await playerSkipHandler(mockQueue, mockTrack, TrackSkipReason.Manual);

	expect(
		mockedOpusCacheManager.getInstance().deleteEntry,
	).not.toHaveBeenCalled();
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

	await playerSkipHandler(mockQueue, mockTrack, TrackSkipReason.Manual);

	expect(mockedOpusCacheManager.getInstance().deleteEntry).toHaveBeenCalledWith(
		'mock_filename.opus',
	);
});

it('should send warning embed when `playerSkip` reason is `NoStream`', async () => {
	const mockClient = createMockClient();
	const mockPlayer = createMockPlayer();
	const mockQueue = createMockQueue();
	const mockChannel = createMockChannel();
	const mockTrack = createMockTrack();

	(mockQueue.metadata.interaction.channel as TextChannel) = mockChannel;

	usePlayerEventHandlers(mockClient, mockPlayer);

	const playerSkipHandler = (
		mockPlayer.events.on as ReturnType<typeof vi.fn>
	).mock.calls.find((call) => call[0] === 'playerSkip')?.[1];

	await playerSkipHandler(mockQueue, mockTrack, TrackSkipReason.NoStream);

	expect(mockChannel.send).toHaveBeenCalledWith({
		embeds: [
			expect.objectContaining({
				data: expect.objectContaining({
					title: 'Track Skipped',
					color: expect.any(Number),
				}),
			}),
		],
	});
});

it('should not send warning embed when `playerSkip` reason is not `NoStream`', async () => {
	const mockClient = createMockClient();
	const mockPlayer = createMockPlayer();
	const mockQueue = createMockQueue();
	const mockChannel = createMockChannel();
	const mockTrack = createMockTrack();

	(mockQueue.metadata.interaction.channel as TextChannel) = mockChannel;

	usePlayerEventHandlers(mockClient, mockPlayer);

	const playerSkipHandler = (
		mockPlayer.events.on as ReturnType<typeof vi.fn>
	).mock.calls.find((call) => call[0] === 'playerSkip')?.[1];

	await playerSkipHandler(mockQueue, mockTrack, TrackSkipReason.Manual);

	expect(mockChannel.send).not.toHaveBeenCalled();
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

	expect(mockedStatsHandler.saveStat).toHaveBeenCalledWith('play', {
		title: MOCK_TRACK_TITLE,
		author: MOCK_TRACK_AUTHOR,
		requestedById: MOCK_USER_ID,
	});
});

it('should register `playerFinish` event handler', () => {
	const mockClient = createMockClient();
	const mockPlayer = createMockPlayer();

	usePlayerEventHandlers(mockClient, mockPlayer);

	expect(mockPlayer.events.on).toHaveBeenCalledWith(
		'playerFinish',
		expect.any(Function),
	);
});

it('should return early from `playerFinish` when guild ID is missing', async () => {
	const mockClient = createMockClient();
	const mockPlayer = createMockPlayer();
	const mockQueue = createMockQueue();
	const mockTrack = createMockTrack();

	(mockQueue as unknown as Record<string, unknown>).guild = {};

	usePlayerEventHandlers(mockClient, mockPlayer);

	const playerFinishHandler = (
		mockPlayer.events.on as ReturnType<typeof vi.fn>
	).mock.calls.find((call) => call[0] === 'playerFinish')?.[1];

	await playerFinishHandler(mockQueue, mockTrack);

	expect(mockedCreateTrackEmbed).not.toHaveBeenCalledWith(
		mockTrack,
		'✅ Finished playing.',
	);
});

it('should return early from `playerFinish` when no matching entry exists', async () => {
	const mockClient = createMockClient();
	const mockPlayer = createMockPlayer();
	const mockQueue = createMockQueue();
	const mockTrack = createMockTrack({ id: 'track-999' });

	usePlayerEventHandlers(mockClient, mockPlayer);

	const playerFinishHandler = (
		mockPlayer.events.on as ReturnType<typeof vi.fn>
	).mock.calls.find((call) => call[0] === 'playerFinish')?.[1];

	await playerFinishHandler(mockQueue, mockTrack);

	expect(mockedCreateTrackEmbed).not.toHaveBeenCalledWith(
		mockTrack,
		'✅ Finished playing.',
	);
});

it('should handle `playerFinish` for a non-cached track with cache file', async () => {
	const mockClient = createMockClient();
	const mockPlayer = createMockPlayer();
	const mockQueue = createMockQueue();
	const mockTrack = createMockTrack({ id: 'finish-track-1' });
	const mockChannel = createMockChannel();
	const mockResponse = {
		awaitMessageComponent: vi.fn(),
		edit: vi.fn().mockResolvedValue(undefined),
	};

	(mockQueue.metadata.interaction.channel as TextChannel) = mockChannel;
	(mockChannel.send as ReturnType<typeof vi.fn>).mockResolvedValue(
		mockResponse,
	);
	mockResponse.awaitMessageComponent.mockRejectedValue(new Error('timeout'));

	const mockFinishedEmbed = {
		title: 'Finished Embed',
		setFooter: vi.fn(),
	};
	mockedCreateTrackEmbed
		.mockResolvedValueOnce({ title: 'Mock Embed' } as never)
		.mockResolvedValueOnce(mockFinishedEmbed as never);

	vi.mocked(stat).mockResolvedValue({ size: 1500000 } as never);

	usePlayerEventHandlers(mockClient, mockPlayer);

	const playerStartHandler = (
		mockPlayer.events.on as ReturnType<typeof vi.fn>
	).mock.calls.find((call) => call[0] === 'playerStart')?.[1];
	const playerFinishHandler = (
		mockPlayer.events.on as ReturnType<typeof vi.fn>
	).mock.calls.find((call) => call[0] === 'playerFinish')?.[1];

	await playerStartHandler(mockQueue, mockTrack);
	await playerFinishHandler(mockQueue, mockTrack);

	expect(mockFinishedEmbed.setFooter).toHaveBeenCalledWith({
		text: expect.stringContaining('💾 Saved to the offline cache'),
	});
	expect(mockResponse.edit).toHaveBeenCalledWith({
		embeds: [mockFinishedEmbed],
		components: [],
	});
});

it('should handle `playerFinish` for a cached track (`isFromCache`)', async () => {
	const mockClient = createMockClient();
	const mockPlayer = createMockPlayer();
	const mockQueue = createMockQueue();
	const mockTrack = createMockTrack({
		id: 'finish-track-2',
		metadata: { isFromCache: true, cacheFilename: 'cached_file.opus' },
	});
	const mockChannel = createMockChannel();
	const mockResponse = {
		awaitMessageComponent: vi.fn(),
		edit: vi.fn().mockResolvedValue(undefined),
	};

	(mockQueue.metadata.interaction.channel as TextChannel) = mockChannel;
	(mockChannel.send as ReturnType<typeof vi.fn>).mockResolvedValue(
		mockResponse,
	);
	mockResponse.awaitMessageComponent.mockRejectedValue(new Error('timeout'));

	const mockFinishedEmbed = {
		title: 'Finished Embed',
		setFooter: vi.fn(),
	};
	mockedCreateTrackEmbed
		.mockResolvedValueOnce({ title: 'Mock Embed' } as never)
		.mockResolvedValueOnce(mockFinishedEmbed as never);

	vi.mocked(stat).mockResolvedValue({ size: 2000000 } as never);

	usePlayerEventHandlers(mockClient, mockPlayer);

	const playerStartHandler = (
		mockPlayer.events.on as ReturnType<typeof vi.fn>
	).mock.calls.find((call) => call[0] === 'playerStart')?.[1];
	const playerFinishHandler = (
		mockPlayer.events.on as ReturnType<typeof vi.fn>
	).mock.calls.find((call) => call[0] === 'playerFinish')?.[1];

	await playerStartHandler(mockQueue, mockTrack);
	await playerFinishHandler(mockQueue, mockTrack);

	expect(mockFinishedEmbed.setFooter).toHaveBeenCalledWith({
		text: expect.stringContaining('♻️ Was streamed from the offline cache'),
	});
});

it('should handle `playerFinish` when stat fails (empty catch)', async () => {
	const mockClient = createMockClient();
	const mockPlayer = createMockPlayer();
	const mockQueue = createMockQueue();
	const mockTrack = createMockTrack({ id: 'finish-track-3' });
	const mockChannel = createMockChannel();
	const mockResponse = {
		awaitMessageComponent: vi.fn(),
		edit: vi.fn().mockResolvedValue(undefined),
	};

	(mockQueue.metadata.interaction.channel as TextChannel) = mockChannel;
	(mockChannel.send as ReturnType<typeof vi.fn>).mockResolvedValue(
		mockResponse,
	);
	mockResponse.awaitMessageComponent.mockRejectedValue(new Error('timeout'));

	const mockFinishedEmbed = {
		title: 'Finished Embed',
		setFooter: vi.fn(),
	};
	mockedCreateTrackEmbed
		.mockResolvedValueOnce({ title: 'Mock Embed' } as never)
		.mockResolvedValueOnce(mockFinishedEmbed as never);

	vi.mocked(stat).mockRejectedValue(new Error('ENOENT'));

	usePlayerEventHandlers(mockClient, mockPlayer);

	const playerStartHandler = (
		mockPlayer.events.on as ReturnType<typeof vi.fn>
	).mock.calls.find((call) => call[0] === 'playerStart')?.[1];
	const playerFinishHandler = (
		mockPlayer.events.on as ReturnType<typeof vi.fn>
	).mock.calls.find((call) => call[0] === 'playerFinish')?.[1];

	await playerStartHandler(mockQueue, mockTrack);
	await playerFinishHandler(mockQueue, mockTrack);

	expect(mockFinishedEmbed.setFooter).not.toHaveBeenCalled();
	expect(mockResponse.edit).toHaveBeenCalledWith({
		embeds: [mockFinishedEmbed],
		components: [],
	});
});

it('should handle `playerFinish` when response.edit fails (empty catch)', async () => {
	const mockClient = createMockClient();
	const mockPlayer = createMockPlayer();
	const mockQueue = createMockQueue();
	const mockTrack = createMockTrack({ id: 'finish-track-4' });
	const mockChannel = createMockChannel();
	const mockResponse = {
		awaitMessageComponent: vi.fn(),
		edit: vi.fn().mockRejectedValue(new Error('Unknown message')),
	};

	(mockQueue.metadata.interaction.channel as TextChannel) = mockChannel;
	(mockChannel.send as ReturnType<typeof vi.fn>).mockResolvedValue(
		mockResponse,
	);
	mockResponse.awaitMessageComponent.mockRejectedValue(new Error('timeout'));

	mockedCreateTrackEmbed
		.mockResolvedValueOnce({ title: 'Mock Embed' } as never)
		.mockResolvedValueOnce({ title: 'Finished', setFooter: vi.fn() } as never);

	vi.mocked(stat).mockRejectedValue(new Error('ENOENT'));

	usePlayerEventHandlers(mockClient, mockPlayer);

	const playerStartHandler = (
		mockPlayer.events.on as ReturnType<typeof vi.fn>
	).mock.calls.find((call) => call[0] === 'playerStart')?.[1];
	const playerFinishHandler = (
		mockPlayer.events.on as ReturnType<typeof vi.fn>
	).mock.calls.find((call) => call[0] === 'playerFinish')?.[1];

	await playerStartHandler(mockQueue, mockTrack);
	await playerFinishHandler(mockQueue, mockTrack);

	expect(mockResponse.edit).toHaveBeenCalled();
});

it('should handle `playerFinish` for cached track without `cacheFilename`', async () => {
	const mockClient = createMockClient();
	const mockPlayer = createMockPlayer();
	const mockQueue = createMockQueue();
	const mockTrack = createMockTrack({
		id: 'finish-track-5',
		metadata: { isFromCache: true },
	});
	const mockChannel = createMockChannel();
	const mockResponse = {
		awaitMessageComponent: vi.fn(),
		edit: vi.fn().mockResolvedValue(undefined),
	};

	(mockQueue.metadata.interaction.channel as TextChannel) = mockChannel;
	(mockChannel.send as ReturnType<typeof vi.fn>).mockResolvedValue(
		mockResponse,
	);
	mockResponse.awaitMessageComponent.mockRejectedValue(new Error('timeout'));

	const mockFinishedEmbed = {
		title: 'Finished Embed',
		setFooter: vi.fn(),
	};
	mockedCreateTrackEmbed
		.mockResolvedValueOnce({ title: 'Mock Embed' } as never)
		.mockResolvedValueOnce(mockFinishedEmbed as never);

	vi.mocked(stat).mockResolvedValue({ size: 500000 } as never);

	usePlayerEventHandlers(mockClient, mockPlayer);

	const playerStartHandler = (
		mockPlayer.events.on as ReturnType<typeof vi.fn>
	).mock.calls.find((call) => call[0] === 'playerStart')?.[1];
	const playerFinishHandler = (
		mockPlayer.events.on as ReturnType<typeof vi.fn>
	).mock.calls.find((call) => call[0] === 'playerFinish')?.[1];

	await playerStartHandler(mockQueue, mockTrack);
	await playerFinishHandler(mockQueue, mockTrack);

	expect(
		mockedOpusCacheManager.getInstance().generateFilename,
	).toHaveBeenCalled();
	expect(mockFinishedEmbed.setFooter).toHaveBeenCalledWith({
		text: expect.stringContaining('♻️ Was streamed from the offline cache'),
	});
});

it('should show stream error message in `playerFinish` when track has `streamError` metadata', async () => {
	const mockClient = createMockClient();
	const mockPlayer = createMockPlayer();
	const mockQueue = createMockQueue();
	const mockTrack = createMockTrack({
		id: 'finish-track-error',
		metadata: { streamError: new Error('Stream failed') },
	});
	const mockChannel = createMockChannel();
	const mockResponse = {
		awaitMessageComponent: vi.fn(),
		edit: vi.fn().mockResolvedValue(undefined),
	};

	(mockQueue.metadata.interaction.channel as TextChannel) = mockChannel;
	(mockChannel.send as ReturnType<typeof vi.fn>).mockResolvedValue(
		mockResponse,
	);
	mockResponse.awaitMessageComponent.mockRejectedValue(new Error('timeout'));

	const mockFinishedEmbed = {
		title: 'Finished Embed',
		setFooter: vi.fn(),
		setColor: vi.fn(),
	};
	mockedCreateTrackEmbed
		.mockResolvedValueOnce({ title: 'Mock Embed' } as never)
		.mockResolvedValueOnce(mockFinishedEmbed as never);

	vi.mocked(stat).mockRejectedValue(new Error('ENOENT'));

	usePlayerEventHandlers(mockClient, mockPlayer);

	const playerStartHandler = (
		mockPlayer.events.on as ReturnType<typeof vi.fn>
	).mock.calls.find((call) => call[0] === 'playerStart')?.[1];
	const playerFinishHandler = (
		mockPlayer.events.on as ReturnType<typeof vi.fn>
	).mock.calls.find((call) => call[0] === 'playerFinish')?.[1];

	await playerStartHandler(mockQueue, mockTrack);
	await playerFinishHandler(mockQueue, mockTrack);

	expect(mockedCreateTrackEmbed).toHaveBeenLastCalledWith(
		mockTrack,
		'Could not stream this track.',
	);
	expect(mockFinishedEmbed.setColor).toHaveBeenCalledWith('Orange');
});

it('should not set footer for non-cached track when cache file has zero size', async () => {
	const mockClient = createMockClient();
	const mockPlayer = createMockPlayer();
	const mockQueue = createMockQueue();
	const mockTrack = createMockTrack({ id: 'finish-track-6' });
	const mockChannel = createMockChannel();
	const mockResponse = {
		awaitMessageComponent: vi.fn(),
		edit: vi.fn().mockResolvedValue(undefined),
	};

	(mockQueue.metadata.interaction.channel as TextChannel) = mockChannel;
	(mockChannel.send as ReturnType<typeof vi.fn>).mockResolvedValue(
		mockResponse,
	);
	mockResponse.awaitMessageComponent.mockRejectedValue(new Error('timeout'));

	const mockFinishedEmbed = {
		title: 'Finished Embed',
		setFooter: vi.fn(),
	};
	mockedCreateTrackEmbed
		.mockResolvedValueOnce({ title: 'Mock Embed' } as never)
		.mockResolvedValueOnce(mockFinishedEmbed as never);

	vi.mocked(stat).mockResolvedValue({ size: 0 } as never);

	usePlayerEventHandlers(mockClient, mockPlayer);

	const playerStartHandler = (
		mockPlayer.events.on as ReturnType<typeof vi.fn>
	).mock.calls.find((call) => call[0] === 'playerStart')?.[1];
	const playerFinishHandler = (
		mockPlayer.events.on as ReturnType<typeof vi.fn>
	).mock.calls.find((call) => call[0] === 'playerFinish')?.[1];

	await playerStartHandler(mockQueue, mockTrack);
	await playerFinishHandler(mockQueue, mockTrack);

	expect(mockFinishedEmbed.setFooter).not.toHaveBeenCalled();
});
