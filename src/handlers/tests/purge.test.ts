import type { ChatInputCommandInteraction } from 'discord.js';
import type { Track } from 'discord-player';
import { useQueue } from 'discord-player';
import { beforeEach, expect, it, vi } from 'vitest';
import { OpusCacheManager } from '../../utils/OpusCacheManager';
import { QueueRecoveryService } from '../../utils/QueueRecoveryService';
import purgeCommandHandler from '../purge';

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

vi.mock('../../utils/OpusCacheManager', () => ({
	OpusCacheManager: {
		getInstance: vi.fn().mockReturnValue({
			generateFilename: vi.fn().mockReturnValue('mock_filename.opus'),
			deleteEntry: vi.fn().mockResolvedValue(undefined),
		}),
	},
}));

const mockedUseQueue = vi.mocked(useQueue);
const mockedQueueRecoveryService = vi.mocked(
	QueueRecoveryService.getInstance(),
);
const mockedOpusCacheManager = vi.mocked(OpusCacheManager.getInstance());

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
		cleanTitle: 'Example Track',
		author: 'Example Artist',
		durationMS: 180000,
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
		size: 0,
		...overrides,
	} as unknown as NonNullable<ReturnType<typeof useQueue>>;
}

it('should handle null queue', async () => {
	const interaction = createMockInteraction();
	mockedUseQueue.mockReturnValue(null);

	await purgeCommandHandler(interaction);

	expect(mockedOpusCacheManager.deleteEntry).not.toHaveBeenCalled();
	expect(mockedQueueRecoveryService.saveQueue).not.toHaveBeenCalled();
	expect(interaction.reply).toHaveBeenCalledWith({
		content: 'No music is currently playing.',
		flags: ['Ephemeral'],
	});
});

it('should delete opus cache entry when track has non-cache metadata', async () => {
	const interaction = createMockInteraction();
	const track = createMockTrack({ metadata: { someProperty: 'value' } });
	const mockQueue = createMockQueue({ currentTrack: track });
	mockedUseQueue.mockReturnValue(mockQueue);

	await purgeCommandHandler(interaction);

	expect(mockedOpusCacheManager.deleteEntry).toHaveBeenCalledWith(
		'mock_filename.opus',
	);
});

it('should not delete opus cache entry when track has `isFromCache` metadata', async () => {
	const interaction = createMockInteraction();
	const track = createMockTrack({
		metadata: { isFromCache: true, someProperty: 'value' },
	});
	const mockQueue = createMockQueue({ currentTrack: track });
	mockedUseQueue.mockReturnValue(mockQueue);

	await purgeCommandHandler(interaction);

	expect(mockedOpusCacheManager.deleteEntry).not.toHaveBeenCalled();
});

it('should not delete opus cache entry when track metadata is not an object', async () => {
	const interaction = createMockInteraction();
	const track = createMockTrack({ metadata: 'string-metadata' });
	const mockQueue = createMockQueue({ currentTrack: track });
	mockedUseQueue.mockReturnValue(mockQueue);

	await purgeCommandHandler(interaction);

	expect(mockedOpusCacheManager.deleteEntry).not.toHaveBeenCalled();
});

it('should not delete opus cache entry when track metadata is null', async () => {
	const interaction = createMockInteraction();
	const track = createMockTrack({ metadata: null });
	const mockQueue = createMockQueue({ currentTrack: track });
	mockedUseQueue.mockReturnValue(mockQueue);

	await purgeCommandHandler(interaction);

	expect(mockedOpusCacheManager.deleteEntry).not.toHaveBeenCalled();
});

it('should not delete opus cache entry when there is no current track', async () => {
	const interaction = createMockInteraction();
	const mockQueue = createMockQueue({ currentTrack: null });
	mockedUseQueue.mockReturnValue(mockQueue);

	await purgeCommandHandler(interaction);

	expect(mockedOpusCacheManager.deleteEntry).not.toHaveBeenCalled();
});

it('should save queue when it is not empty', async () => {
	const interaction = createMockInteraction();
	const mockQueue = createMockQueue({ size: 1 }); // Queue has content
	mockedUseQueue.mockReturnValue(mockQueue);

	await purgeCommandHandler(interaction);

	expect(mockedQueueRecoveryService.saveQueue).toHaveBeenCalledWith(mockQueue);
});

it('should not save queue when it is empty', async () => {
	const interaction = createMockInteraction();
	const mockQueue = createMockQueue({ size: 0 }); // Truly empty queue
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
	const mockQueue = createMockQueue({ currentTrack: track, size: 1 }); // Queue has content
	mockedUseQueue.mockReturnValue(mockQueue);

	await purgeCommandHandler(interaction);

	expect(mockedOpusCacheManager.deleteEntry).toHaveBeenCalledWith(
		'mock_filename.opus',
	);
	expect(mockedQueueRecoveryService.saveQueue).toHaveBeenCalledWith(mockQueue);
	expect(mockQueue.delete).toHaveBeenCalledOnce();
	expect(interaction.reply).toHaveBeenCalledWith(
		'Queue purged.\n\nUse `/recover` to listen to the same queue again.',
	);
});

it('should save queue when only currentTrack exists (single playing song scenario)', async () => {
	const interaction = createMockInteraction();
	const track = createMockTrack();
	const mockQueue = createMockQueue({
		currentTrack: track,
		size: 1,
	});

	mockQueue.isEmpty = vi.fn().mockReturnValue(true);

	mockedUseQueue.mockReturnValue(mockQueue);

	await purgeCommandHandler(interaction);

	expect(mockedQueueRecoveryService.saveQueue).toHaveBeenCalledWith(mockQueue);
	expect(mockQueue.delete).toHaveBeenCalledOnce();
	expect(interaction.reply).toHaveBeenCalledWith(
		'Queue purged.\n\nUse `/recover` to listen to the same queue again.',
	);
});
