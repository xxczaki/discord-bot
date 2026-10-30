import { setTimeout } from 'node:timers/promises';
import { captureException } from '@sentry/node';
import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { beforeEach, expect, it, vi } from 'vitest';
import isObject from '../../utils/isObject.ts';
import logger from '../../utils/logger.ts';
import redis from '../../utils/redis.ts';
import statsCommandHandler from '../stats.ts';

const EXAMPLE_REDIS_KEYS = [
	'discord-player:stats:play:01HV4F5C123456789ABCDEFG',
	'discord-player:stats:play:01HV4F5C987654321ZYXWVUTS',
	'discord-player:stats:play:01HV4F5CABCDEFGHIJKLMNOP',
];

const EXAMPLE_TRACK_STATS = [
	{
		title: 'Never Gonna Give You Up',
		author: 'Rick Astley',
		requestedById: '123456789',
	},
	{
		title: 'Bohemian Rhapsody',
		author: 'Queen',
		requestedById: '987654321',
	},
	{
		title: 'Never Gonna Give You Up',
		author: 'Rick Astley',
		requestedById: '456789123',
	},
];

const mockStatsHandlerInstance = vi.hoisted(() => ({
	getStats: vi.fn(),
}));

vi.mock('../../utils/StatsHandler', () => ({
	StatsHandler: {
		getInstance: vi.fn(() => mockStatsHandlerInstance),
	},
}));

const mockedCaptureException = vi.mocked(captureException);
const mockedLogger = vi.mocked(logger);
const mockedRedis = vi.mocked(redis);

function createMockInteraction(): ChatInputCommandInteraction {
	return {
		guildId: 'guild-123',
		client: {
			user: {
				id: 'bot-id-12345',
			},
		},
		reply: vi.fn().mockResolvedValue({}),
		editReply: vi.fn().mockResolvedValue({}),
	} as unknown as ChatInputCommandInteraction;
}

function createScanStream(batches: string[][]): AsyncIterable<string[]> {
	return {
		async *[Symbol.asyncIterator]() {
			for (const batch of batches) {
				yield batch;
			}
		},
	};
}

function setupMockStreams(
	playBatches: string[][] = [],
	playlistBatches: string[][] = [],
) {
	mockStatsHandlerInstance.getStats
		.mockReturnValueOnce(createScanStream(playBatches))
		.mockReturnValueOnce(createScanStream(playlistBatches));
}

function mockPipelineResults(results: [Error | null, unknown][]) {
	const mockPipeline = {
		get: vi.fn().mockReturnThis(),
		exec: vi.fn().mockResolvedValue(results),
	} as unknown as ReturnType<typeof redis.pipeline>;

	mockedRedis.pipeline.mockReturnValue(mockPipeline);

	return mockPipeline;
}

function getEmbedDescription(interaction: ChatInputCommandInteraction) {
	const payload = vi.mocked(interaction.editReply).mock.lastCall?.[0];

	if (!isObject(payload) || !Array.isArray(payload.embeds)) {
		throw new Error('Expected the last reply to contain embeds');
	}

	const [embed] = payload.embeds;

	if (!(embed instanceof EmbedBuilder)) {
		throw new Error('Expected an `EmbedBuilder` instance');
	}

	return embed.data.description ?? '';
}

beforeEach(() => {
	vi.clearAllMocks();

	mockPipelineResults([]);
});

it('should reply with loading message and process stats successfully', async () => {
	const interaction = createMockInteraction();

	setupMockStreams([EXAMPLE_REDIS_KEYS]);

	const mockPipeline = mockPipelineResults([
		[null, JSON.stringify(EXAMPLE_TRACK_STATS[0])],
		[null, JSON.stringify(EXAMPLE_TRACK_STATS[1])],
		[null, JSON.stringify(EXAMPLE_TRACK_STATS[2])],
	]);

	await statsCommandHandler(interaction);

	expect(interaction.editReply).toHaveBeenCalledWith('Loading latest stats…');
	expect(mockStatsHandlerInstance.getStats).toHaveBeenCalledWith(
		'guild-123',
		'play',
	);
	expect(mockStatsHandlerInstance.getStats).toHaveBeenCalledWith(
		'guild-123',
		'playlist',
	);

	expect(mockedRedis.pipeline).toHaveBeenCalledTimes(1);
	expect(mockPipeline.get).toHaveBeenCalledTimes(3);
	expect(mockPipeline.get).toHaveBeenCalledWith(EXAMPLE_REDIS_KEYS[0]);
	expect(mockPipeline.get).toHaveBeenCalledWith(EXAMPLE_REDIS_KEYS[1]);
	expect(mockPipeline.get).toHaveBeenCalledWith(EXAMPLE_REDIS_KEYS[2]);

	expect(interaction.editReply).toHaveBeenLastCalledWith({
		embeds: [expect.any(EmbedBuilder)],
		content: null,
	});
});

it('should handle tracks with multiple plays correctly', async () => {
	const interaction = createMockInteraction();

	const duplicateTrackStats = [
		{ title: 'Test Song', author: 'Test Artist', requestedById: '123' },
		{ title: 'Test Song', author: 'Test Artist', requestedById: '456' },
	];

	setupMockStreams([['key1', 'key2']]);
	mockPipelineResults([
		[null, JSON.stringify(duplicateTrackStats[0])],
		[null, JSON.stringify(duplicateTrackStats[1])],
	]);

	await statsCommandHandler(interaction);

	expect(getEmbedDescription(interaction)).toContain(
		'2 – "Test Song" by Test Artist',
	);
});

it('should skip tracks without `requestedById`', async () => {
	const interaction = createMockInteraction();

	const trackWithoutRequesterId = {
		title: 'Background Track',
		author: 'System',
	};

	setupMockStreams([['key1']]);
	mockPipelineResults([[null, JSON.stringify(trackWithoutRequesterId)]]);

	await statsCommandHandler(interaction);

	const description = getEmbedDescription(interaction);

	expect(description).toContain('*empty*');
	expect(description).toContain('**Total Played**: 0');
});

it('should handle Redis get returning null values', async () => {
	const interaction = createMockInteraction();

	setupMockStreams([['key1']]);
	mockPipelineResults([[null, null]]);

	await statsCommandHandler(interaction);

	const description = getEmbedDescription(interaction);

	expect(description).toContain('*empty*');
	expect(description).toContain('**Total Played**: 0');
});

it('should skip pipeline entries that returned an error', async () => {
	const interaction = createMockInteraction();

	setupMockStreams([['key1', 'key2']]);
	mockPipelineResults([
		[new Error('WRONGTYPE'), JSON.stringify(EXAMPLE_TRACK_STATS[0])],
		[null, JSON.stringify(EXAMPLE_TRACK_STATS[1])],
	]);

	await statsCommandHandler(interaction);

	const description = getEmbedDescription(interaction);

	expect(description).toContain('**Total Played**: 1');
	expect(description).toContain('1 – <@!987654321>');
	expect(description).not.toContain('<@!123456789>');
});

it('should handle JSON parsing errors gracefully', async () => {
	const interaction = createMockInteraction();

	setupMockStreams([['key1']]);
	mockPipelineResults([[null, 'invalid-json']]);

	await statsCommandHandler(interaction);

	expect(mockedLogger.error).toHaveBeenCalledWith(
		expect.any(SyntaxError),
		'Failed to parse stats JSON value',
	);
	expect(mockedCaptureException).toHaveBeenCalled();
	expect(getEmbedDescription(interaction)).toContain('**Total Played**: 0');
});

it('should finish processing a batch before requesting the next one', async () => {
	const interaction = createMockInteraction();
	const events: string[] = [];

	mockStatsHandlerInstance.getStats
		.mockReturnValueOnce({
			async *[Symbol.asyncIterator]() {
				events.push('batch-1-requested');
				yield ['key1'];
				events.push('batch-2-requested');
				yield ['key2'];
			},
		})
		.mockReturnValueOnce(createScanStream([]));

	const mockPipeline = {
		get: vi.fn().mockReturnThis(),
		exec: vi.fn(async () => {
			await setTimeout(5);
			events.push('batch-processed');

			return [[null, JSON.stringify(EXAMPLE_TRACK_STATS[0])]];
		}),
	} as unknown as ReturnType<typeof redis.pipeline>;
	mockedRedis.pipeline.mockReturnValue(mockPipeline);

	await statsCommandHandler(interaction);

	expect(events).toEqual([
		'batch-1-requested',
		'batch-processed',
		'batch-2-requested',
		'batch-processed',
	]);
});

it('should skip empty batches without querying Redis', async () => {
	const interaction = createMockInteraction();

	setupMockStreams([[]], [[]]);

	await statsCommandHandler(interaction);

	expect(mockedRedis.pipeline).not.toHaveBeenCalled();
	expect(getEmbedDescription(interaction)).toContain('**Total Played**: 0');
});

it('should aggregate stats by user correctly', async () => {
	const interaction = createMockInteraction();

	const statsWithSameUser = [
		{ title: 'Song 1', author: 'Artist 1', requestedById: '123' },
		{ title: 'Song 2', author: 'Artist 2', requestedById: '123' },
		{ title: 'Song 3', author: 'Artist 3', requestedById: '456' },
	];

	setupMockStreams([['key1', 'key2', 'key3']]);
	mockPipelineResults([
		[null, JSON.stringify(statsWithSameUser[0])],
		[null, JSON.stringify(statsWithSameUser[1])],
		[null, JSON.stringify(statsWithSameUser[2])],
	]);

	await statsCommandHandler(interaction);

	const description = getEmbedDescription(interaction);

	expect(description).toContain('2 – <@!123>\n1 – <@!456>');
	expect(description).toContain('**Total Played**: 3');
});

it('should only show tracks played more than once in top list', async () => {
	const interaction = createMockInteraction();

	setupMockStreams([['key1']]);
	mockPipelineResults([
		[
			null,
			JSON.stringify({
				title: 'Song 1',
				author: 'Artist 1',
				requestedById: '123',
			}),
		],
	]);

	await statsCommandHandler(interaction);

	expect(getEmbedDescription(interaction)).toContain(
		'**Top 10 Most Frequently Played**:\n*empty*',
	);

	const payload = vi.mocked(interaction.editReply).mock.lastCall?.[0];

	expect(payload).toEqual({
		embeds: [
			expect.objectContaining({
				data: expect.objectContaining({
					footer: { text: 'Not showing tracks played just once' },
				}),
			}),
		],
		content: null,
	});
});

it('should wait for all batches to be processed before calculating totals', async () => {
	const interaction = createMockInteraction();

	const batch1Stats = [
		{ title: 'Song 1', author: 'Artist 1', requestedById: '111' },
		{ title: 'Song 2', author: 'Artist 2', requestedById: '222' },
	];

	const batch2Stats = [
		{ title: 'Song 3', author: 'Artist 3', requestedById: '333' },
		{ title: 'Song 4', author: 'Artist 4', requestedById: '444' },
	];

	setupMockStreams([
		['key1', 'key2'],
		['key3', 'key4'],
	]);

	const mockPipeline1 = {
		get: vi.fn().mockReturnThis(),
		exec: vi.fn(async () => {
			await setTimeout(50);

			return [
				[null, JSON.stringify(batch1Stats[0])],
				[null, JSON.stringify(batch1Stats[1])],
			];
		}),
	} as unknown as ReturnType<typeof redis.pipeline>;

	const mockPipeline2 = {
		get: vi.fn().mockReturnThis(),
		exec: vi.fn(async () => {
			await setTimeout(20);

			return [
				[null, JSON.stringify(batch2Stats[0])],
				[null, JSON.stringify(batch2Stats[1])],
			];
		}),
	} as unknown as ReturnType<typeof redis.pipeline>;

	mockedRedis.pipeline
		.mockReturnValueOnce(mockPipeline1)
		.mockReturnValueOnce(mockPipeline2);

	await statsCommandHandler(interaction);

	expect(mockPipeline1.get).toHaveBeenCalledWith('key1');
	expect(mockPipeline2.get).toHaveBeenCalledWith('key4');
	expect(getEmbedDescription(interaction)).toContain('**Total Played**: 4');
});

it('should handle Redis pipeline exec error gracefully', async () => {
	const interaction = createMockInteraction();

	setupMockStreams([['key1']]);

	const mockPipeline = {
		get: vi.fn().mockReturnThis(),
		exec: vi.fn().mockRejectedValue(new Error('Redis connection failed')),
	} as unknown as ReturnType<typeof redis.pipeline>;

	mockedRedis.pipeline.mockReturnValue(mockPipeline);

	await statsCommandHandler(interaction);

	expect(mockedLogger.error).toHaveBeenCalledWith(
		expect.any(Error),
		'Failed to process stats data from Redis',
	);
	expect(mockedCaptureException).toHaveBeenCalled();
	expect(getEmbedDescription(interaction)).toContain('**Total Played**: 0');
});

it('should process playlist stats correctly', async () => {
	const interaction = createMockInteraction();

	const playlistStats = [
		{ playlistId: 'spotify-playlist-123', requestedById: '111' },
		{ playlistId: 'spotify-playlist-456', requestedById: '222' },
		{ playlistId: 'spotify-playlist-123', requestedById: '333' },
	];

	setupMockStreams([], [['playlist-key1', 'playlist-key2', 'playlist-key3']]);
	mockPipelineResults([
		[null, JSON.stringify(playlistStats[0])],
		[null, JSON.stringify(playlistStats[1])],
		[null, JSON.stringify(playlistStats[2])],
	]);

	await statsCommandHandler(interaction);

	expect(getEmbedDescription(interaction)).toContain(
		'**Top 10 Most Enqueued Playlists**:\n2 – spotify-playlist-123\n1 – spotify-playlist-456',
	);
});

it('should handle playlist stats processing errors gracefully', async () => {
	const interaction = createMockInteraction();

	setupMockStreams([], [['playlist-key1']]);

	const mockPipeline = {
		get: vi.fn().mockReturnThis(),
		exec: vi.fn().mockRejectedValue(new Error('Redis pipeline failed')),
	} as unknown as ReturnType<typeof redis.pipeline>;

	mockedRedis.pipeline.mockReturnValue(mockPipeline);

	await statsCommandHandler(interaction);

	expect(mockedLogger.error).toHaveBeenCalledWith(
		expect.any(Error),
		'Failed to process playlist stats data from Redis',
	);
	expect(mockedCaptureException).toHaveBeenCalled();
	expect(getEmbedDescription(interaction)).toContain(
		'**Top 10 Most Enqueued Playlists**:\n*empty*',
	);
});

it('should skip playlist stats when requested by bot', async () => {
	const interaction = createMockInteraction();

	setupMockStreams([], [['playlist-key1']]);
	mockPipelineResults([
		[
			null,
			JSON.stringify({
				playlistId: 'spotify-playlist-123',
				requestedById: 'bot-id-12345',
			}),
		],
	]);

	await statsCommandHandler(interaction);

	expect(getEmbedDescription(interaction)).toContain(
		'**Top 10 Most Enqueued Playlists**:\n*empty*',
	);
});

it('should skip tracks requested by bot', async () => {
	const interaction = createMockInteraction();

	setupMockStreams([['key1']]);
	mockPipelineResults([
		[
			null,
			JSON.stringify({
				title: 'Bot Auto-played Song',
				author: 'System',
				requestedById: 'bot-id-12345',
			}),
		],
	]);

	await statsCommandHandler(interaction);

	const description = getEmbedDescription(interaction);

	expect(description).toContain('*empty*');
	expect(description).toContain('**Total Played**: 0');
});
