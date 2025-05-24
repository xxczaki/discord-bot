import type {
	GuildQueue,
	Player,
	SerializedTrack,
	Track,
} from 'discord-player';
import { SerializedType } from 'discord-player';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueueRecoveryService } from '../QueueRecoveryService';
import redis from '../redis';

const EXAMPLE_TRACK_ID = 'track-123';
const EXAMPLE_TRACK_TITLE = 'Test Song';
const EXAMPLE_TRACK_AUTHOR = 'Test Artist';
const EXAMPLE_TRACK_URL = 'https://example.com/track';
const EXAMPLE_PROGRESS = 30000;

const EXAMPLE_SERIALIZED_TRACK: SerializedTrack = {
	title: EXAMPLE_TRACK_TITLE,
	author: EXAMPLE_TRACK_AUTHOR,
	url: EXAMPLE_TRACK_URL,
	duration: '3:45',
	thumbnail: 'https://example.com/thumbnail.jpg',
	requested_by: null,
	metadata: {},
	extractor: 'MockExtractor',
	views: 0,
	description: '',
	query_type: 'auto',
	source: {},
	live: false,
	$type: SerializedType.Track,
	$encoder_version: '1.0.0',
};

vi.mock('../redis', () => ({
	default: {
		pipeline: vi.fn(),
		set: vi.fn(),
		del: vi.fn(),
		get: vi.fn(),
		exec: vi.fn(),
	},
}));

vi.mock('discord-player', async () => {
	const actual = await vi.importActual('discord-player');
	return {
		...actual,
		serialize: vi.fn(),
		deserialize: vi.fn(),
	};
});

const mockedRedis = vi.mocked(redis);
const { serialize, deserialize } = await import('discord-player');
const mockedSerialize = vi.mocked(serialize);
const mockedDeserialize = vi.mocked(deserialize);

const createMockTrack = (overrides: Partial<Track> = {}): Track =>
	({
		id: EXAMPLE_TRACK_ID,
		title: EXAMPLE_TRACK_TITLE,
		author: EXAMPLE_TRACK_AUTHOR,
		url: EXAMPLE_TRACK_URL,
		duration: '3:45',
		thumbnail: 'https://example.com/thumbnail.jpg',
		requestedBy: null,
		metadata: {},
		...overrides,
	}) as Track;

const createMockQueue = (
	overrides: Partial<GuildQueue<unknown>> = {},
): GuildQueue<unknown> => {
	const mockTrack = createMockTrack();
	const mockTracks = {
		store: [
			createMockTrack({ id: 'track-2' }),
			createMockTrack({ id: 'track-3' }),
		],
	};
	const mockNode = {
		getTimestamp: vi.fn(() => ({ current: { value: EXAMPLE_PROGRESS } })),
	};

	return {
		size: 3,
		currentTrack: mockTrack,
		tracks: mockTracks,
		node: mockNode,
		...overrides,
	} as unknown as GuildQueue<unknown>;
};

const createMockPlayer = (): Player =>
	({
		id: 'mock-player',
	}) as Player;

interface MockPipeline {
	set: ReturnType<typeof vi.fn>;
	del: ReturnType<typeof vi.fn>;
	get: ReturnType<typeof vi.fn>;
	exec: ReturnType<typeof vi.fn>;
}

describe('QueueRecoveryService', () => {
	let queueRecoveryService: QueueRecoveryService;
	let mockPipeline: MockPipeline;

	beforeEach(() => {
		vi.clearAllMocks();
		queueRecoveryService = QueueRecoveryService.getInstance();

		mockPipeline = {
			set: vi.fn(),
			del: vi.fn(),
			get: vi.fn(),
			exec: vi.fn(),
		};

		mockedRedis.pipeline.mockReturnValue(
			mockPipeline as unknown as ReturnType<typeof redis.pipeline>,
		);
	});

	it('should be a singleton', () => {
		const instance1 = QueueRecoveryService.getInstance();
		const instance2 = QueueRecoveryService.getInstance();
		expect(instance1).toBe(instance2);
	});

	describe('saveQueue', () => {
		it('should save queue tracks and progress to Redis', async () => {
			const mockQueue = createMockQueue();
			const allTracks = [mockQueue.currentTrack, ...mockQueue.tracks.store];

			mockedSerialize.mockReturnValue(EXAMPLE_SERIALIZED_TRACK);
			mockPipeline.exec.mockResolvedValue([]);

			await queueRecoveryService.saveQueue(mockQueue);

			expect(mockedSerialize).toHaveBeenCalledTimes(allTracks.length);
			expect(mockPipeline.set).toHaveBeenCalledWith(
				'discord-player:queue',
				JSON.stringify(Array(allTracks.length).fill(EXAMPLE_SERIALIZED_TRACK)),
			);
			expect(mockPipeline.set).toHaveBeenCalledWith(
				'discord-player:progress',
				EXAMPLE_PROGRESS,
			);
			expect(mockPipeline.exec).toHaveBeenCalledOnce();
		});

		it('should not save when queue is null', async () => {
			await queueRecoveryService.saveQueue(null);

			expect(mockPipeline.set).not.toHaveBeenCalled();
			expect(mockPipeline.exec).not.toHaveBeenCalled();
		});

		it('should not save when queue is empty', async () => {
			const emptyQueue = createMockQueue({ size: 0 });

			await queueRecoveryService.saveQueue(emptyQueue);

			expect(mockPipeline.set).not.toHaveBeenCalled();
			expect(mockPipeline.exec).not.toHaveBeenCalled();
		});

		it('should handle queue with no current track', async () => {
			const queueWithoutCurrentTrack = createMockQueue({ currentTrack: null });

			mockedSerialize.mockReturnValue(EXAMPLE_SERIALIZED_TRACK);
			mockPipeline.exec.mockResolvedValue([]);

			await queueRecoveryService.saveQueue(queueWithoutCurrentTrack);

			// Should only serialize tracks from store, not the null current track
			expect(mockedSerialize).toHaveBeenCalledTimes(2);
			expect(mockPipeline.exec).toHaveBeenCalledOnce();
		});

		it('should handle missing timestamp', async () => {
			const mockQueue = createMockQueue();
			mockQueue.node.getTimestamp = vi.fn(() => null);

			mockedSerialize.mockReturnValue(EXAMPLE_SERIALIZED_TRACK);
			mockPipeline.exec.mockResolvedValue([]);

			await queueRecoveryService.saveQueue(mockQueue);

			expect(mockPipeline.set).toHaveBeenCalledWith(
				'discord-player:progress',
				0,
			);
		});
	});

	describe('deleteQueue', () => {
		it('should delete queue and progress from Redis', async () => {
			mockPipeline.exec.mockResolvedValue([]);

			await queueRecoveryService.deleteQueue();

			expect(mockPipeline.del).toHaveBeenCalledWith('discord-player:queue');
			expect(mockPipeline.del).toHaveBeenCalledWith('discord-player:progress');
			expect(mockPipeline.exec).toHaveBeenCalledOnce();
		});
	});

	describe('getContents', () => {
		it('should return tracks and progress from Redis', async () => {
			const mockPlayer = createMockPlayer();
			const mockTrack = createMockTrack();
			const serializedTracks = [EXAMPLE_SERIALIZED_TRACK];

			mockPipeline.exec.mockResolvedValue([
				[null, JSON.stringify(serializedTracks)],
				[null, EXAMPLE_PROGRESS],
			]);
			mockedDeserialize.mockReturnValue(mockTrack);

			const result = await queueRecoveryService.getContents(mockPlayer);

			expect(mockPipeline.get).toHaveBeenCalledWith('discord-player:queue');
			expect(mockPipeline.get).toHaveBeenCalledWith('discord-player:progress');
			expect(mockedDeserialize).toHaveBeenCalledWith(
				mockPlayer,
				EXAMPLE_SERIALIZED_TRACK,
			);
			expect(result).toEqual({
				tracks: [mockTrack],
				progress: EXAMPLE_PROGRESS,
			});
		});

		it('should return default contents when Redis returns null', async () => {
			const mockPlayer = createMockPlayer();

			mockPipeline.exec.mockResolvedValue(null);

			const result = await queueRecoveryService.getContents(mockPlayer);

			expect(result).toEqual({
				tracks: [],
				progress: 0,
			});
		});

		it('should return default contents when JSON parsing fails', async () => {
			const mockPlayer = createMockPlayer();

			mockPipeline.exec.mockResolvedValue([
				[null, 'invalid-json'],
				[null, EXAMPLE_PROGRESS],
			]);

			const result = await queueRecoveryService.getContents(mockPlayer);

			expect(result).toEqual({
				tracks: [],
				progress: 0,
			});
		});

		it('should handle empty tracks array', async () => {
			const mockPlayer = createMockPlayer();

			mockPipeline.exec.mockResolvedValue([
				[null, JSON.stringify([])],
				[null, EXAMPLE_PROGRESS],
			]);

			const result = await queueRecoveryService.getContents(mockPlayer);

			expect(result).toEqual({
				tracks: [],
				progress: EXAMPLE_PROGRESS,
			});
		});

		it('should handle multiple tracks', async () => {
			const mockPlayer = createMockPlayer();
			const mockTrack1 = createMockTrack({ id: 'track-1' });
			const mockTrack2 = createMockTrack({ id: 'track-2' });
			const serializedTracks = [
				EXAMPLE_SERIALIZED_TRACK,
				EXAMPLE_SERIALIZED_TRACK,
			];

			mockPipeline.exec.mockResolvedValue([
				[null, JSON.stringify(serializedTracks)],
				[null, EXAMPLE_PROGRESS],
			]);
			mockedDeserialize
				.mockReturnValueOnce(mockTrack1)
				.mockReturnValueOnce(mockTrack2);

			const result = await queueRecoveryService.getContents(mockPlayer);

			expect(mockedDeserialize).toHaveBeenCalledTimes(2);
			expect(result).toEqual({
				tracks: [mockTrack1, mockTrack2],
				progress: EXAMPLE_PROGRESS,
			});
		});
	});
});
