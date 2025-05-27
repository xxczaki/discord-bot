import { useQueue } from 'discord-player';
import type { Track } from 'discord-player';
import type { ChatInputCommandInteraction } from 'discord.js';
import { beforeEach, expect, it, vi } from 'vitest';
import purgeCommandHandler from '../purge';
import { QueueRecoveryService } from '../../utils/QueueRecoveryService';
import deleteOpusCacheEntry from '../../utils/deleteOpusCacheEntry';

const EXAMPLE_TRACK_URL = 'https://example.com/track';

vi.mock('discord-player', () => ({
	useQueue: vi.fn(),
}));

vi.mock('../../utils/QueueRecoveryService', () => ({
	QueueRecoveryService: {
		getInstance: vi.fn().mockReturnValue({
			saveQueue: vi.fn(),
		}),
	},
}));

vi.mock('../../utils/deleteOpusCacheEntry');

const mockedUseQueue = vi.mocked(useQueue);
const mockedQueueRecoveryService = vi.mocked(
	QueueRecoveryService.getInstance(),
);
const mockedDeleteOpusCacheEntry = vi.mocked(deleteOpusCacheEntry);

beforeEach(() => {
	vi.clearAllMocks();
});

function createMockInteraction(): ChatInputCommandInteraction {
	return {
		reply: vi.fn().mockResolvedValue({}),
	} as unknown as ChatInputCommandInteraction;
}

function createMockTrack(overrides: Partial<Track> = {}): Track {
	return {
		url: EXAMPLE_TRACK_URL,
		metadata: {},
		...overrides,
	} as Track;
}

function createMockQueue(
	overrides: Partial<NonNullable<ReturnType<typeof useQueue>>> = {},
): NonNullable<ReturnType<typeof useQueue>> {
	return {
		currentTrack: null,
		isEmpty: vi.fn().mockReturnValue(false),
		delete: vi.fn(),
		...overrides,
	} as unknown as NonNullable<ReturnType<typeof useQueue>>;
}

it('should handle null queue', async () => {
	const interaction = createMockInteraction();
	mockedUseQueue.mockReturnValue(null);

	await purgeCommandHandler(interaction);

	expect(mockedDeleteOpusCacheEntry).not.toHaveBeenCalled();
	expect(mockedQueueRecoveryService.saveQueue).toHaveBeenCalledWith(null);
	expect(interaction.reply).toHaveBeenCalledWith(
		'Queue purged.\n\nUse `/recover` to listen to the same queue again.',
	);
});

it('should delete opus cache entry when track has non-cache metadata', async () => {
	const interaction = createMockInteraction();
	const track = createMockTrack({ metadata: { someProperty: 'value' } });
	const mockQueue = createMockQueue({ currentTrack: track });
	mockedUseQueue.mockReturnValue(mockQueue);

	await purgeCommandHandler(interaction);

	expect(mockedDeleteOpusCacheEntry).toHaveBeenCalledWith(EXAMPLE_TRACK_URL);
});

it('should not delete opus cache entry when track has `isFromCache` metadata', async () => {
	const interaction = createMockInteraction();
	const track = createMockTrack({
		metadata: { isFromCache: true, someProperty: 'value' },
	});
	const mockQueue = createMockQueue({ currentTrack: track });
	mockedUseQueue.mockReturnValue(mockQueue);

	await purgeCommandHandler(interaction);

	expect(mockedDeleteOpusCacheEntry).not.toHaveBeenCalled();
});

it('should not delete opus cache entry when track metadata is not an object', async () => {
	const interaction = createMockInteraction();
	const track = createMockTrack({ metadata: 'string-metadata' });
	const mockQueue = createMockQueue({ currentTrack: track });
	mockedUseQueue.mockReturnValue(mockQueue);

	await purgeCommandHandler(interaction);

	expect(mockedDeleteOpusCacheEntry).not.toHaveBeenCalled();
});

it('should not delete opus cache entry when track metadata is null', async () => {
	const interaction = createMockInteraction();
	const track = createMockTrack({ metadata: null });
	const mockQueue = createMockQueue({ currentTrack: track });
	mockedUseQueue.mockReturnValue(mockQueue);

	await purgeCommandHandler(interaction);

	expect(mockedDeleteOpusCacheEntry).not.toHaveBeenCalled();
});

it('should not delete opus cache entry when there is no current track', async () => {
	const interaction = createMockInteraction();
	const mockQueue = createMockQueue({ currentTrack: null });
	mockedUseQueue.mockReturnValue(mockQueue);

	await purgeCommandHandler(interaction);

	expect(mockedDeleteOpusCacheEntry).not.toHaveBeenCalled();
});

it('should save queue when it is not empty', async () => {
	const interaction = createMockInteraction();
	const mockQueue = createMockQueue();
	mockQueue.isEmpty = vi.fn().mockReturnValue(false);
	mockedUseQueue.mockReturnValue(mockQueue);

	await purgeCommandHandler(interaction);

	expect(mockedQueueRecoveryService.saveQueue).toHaveBeenCalledWith(mockQueue);
});

it('should not save queue when it is empty', async () => {
	const interaction = createMockInteraction();
	const mockQueue = createMockQueue();
	mockQueue.isEmpty = vi.fn().mockReturnValue(true);
	mockedUseQueue.mockReturnValue(mockQueue);

	await purgeCommandHandler(interaction);

	expect(mockedQueueRecoveryService.saveQueue).not.toHaveBeenCalled();
});

it('should delete the queue', async () => {
	const interaction = createMockInteraction();
	const mockQueue = createMockQueue();
	mockedUseQueue.mockReturnValue(mockQueue);

	await purgeCommandHandler(interaction);

	expect(mockQueue.delete).toHaveBeenCalledOnce();
});

it('should reply with purge confirmation message', async () => {
	const interaction = createMockInteraction();
	const mockQueue = createMockQueue();
	mockedUseQueue.mockReturnValue(mockQueue);

	await purgeCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith(
		'Queue purged.\n\nUse `/recover` to listen to the same queue again.',
	);
});

it('should handle full purge workflow with track deletion and queue saving', async () => {
	const interaction = createMockInteraction();
	const track = createMockTrack({ metadata: { customMetadata: 'value' } });
	const mockQueue = createMockQueue({ currentTrack: track });
	mockQueue.isEmpty = vi.fn().mockReturnValue(false);
	mockedUseQueue.mockReturnValue(mockQueue);

	await purgeCommandHandler(interaction);

	expect(mockedDeleteOpusCacheEntry).toHaveBeenCalledWith(EXAMPLE_TRACK_URL);
	expect(mockedQueueRecoveryService.saveQueue).toHaveBeenCalledWith(mockQueue);
	expect(mockQueue.delete).toHaveBeenCalledOnce();
	expect(interaction.reply).toHaveBeenCalledWith(
		'Queue purged.\n\nUse `/recover` to listen to the same queue again.',
	);
});
