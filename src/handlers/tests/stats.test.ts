import { EventEmitter } from 'node:events';
import { captureException } from '@sentry/node';
import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import type { ScanStream } from 'ioredis';
import { beforeEach, expect, it, vi } from 'vitest';
import isObject from '../../utils/isObject';
import logger from '../../utils/logger';
import redis from '../../utils/redis';
import statsCommandHandler from '../stats';

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

interface MockStream extends EventEmitter {
	pause: () => void;
	resume: () => void;
}

function createMockInteraction(): ChatInputCommandInteraction {
	return {
		client: {
			user: {
				id: 'bot-id-12345',
			},
		},
		reply: vi.fn().mockResolvedValue({}),
		editReply: vi.fn().mockResolvedValue({}),
	} as unknown as ChatInputCommandInteraction;
}

function createMockStream(): MockStream {
	const stream = new EventEmitter() as MockStream;

	stream.pause = vi.fn();
	stream.resume = vi.fn();

	return stream;
}

function setupMockStreams(
	playKeys: string[] = [],
	playlistKeys: string[] = [],
	delay = 10,
) {
	const mockPlayStream = createMockStream();
	const mockPlaylistStream = createMockStream();

	mockStatsHandlerInstance.getStats
		.mockReturnValueOnce(mockPlayStream as unknown as ScanStream)
		.mockReturnValueOnce(mockPlaylistStream as unknown as ScanStream);

	setTimeout(() => {
		mockPlayStream.emit('data', playKeys);
	}, delay);

	setTimeout(() => {
		mockPlayStream.emit('end');
	}, delay + 10);

	setTimeout(() => {
		mockPlaylistStream.emit('data', playlistKeys);
	}, delay + 20);

	setTimeout(() => {
		mockPlaylistStream.emit('end');
	}, delay + 30);

	return { mockPlayStream, mockPlaylistStream };
}

beforeEach(() => {
	vi.clearAllMocks();

	const mockPipeline = {
		get: vi.fn().mockReturnThis(),
		exec: vi.fn().mockResolvedValue([]),
	} as unknown as ReturnType<typeof redis.pipeline>;
	mockedRedis.pipeline.mockReturnValue(mockPipeline);
});

it('should reply with loading message and process stats successfully', async () => {
	const interaction = createMockInteraction();

	setupMockStreams(EXAMPLE_REDIS_KEYS);

	const mockPipeline = {
		get: vi.fn().mockReturnThis(),
		exec: vi.fn().mockResolvedValue([
			[null, JSON.stringify(EXAMPLE_TRACK_STATS[0])],
			[null, JSON.stringify(EXAMPLE_TRACK_STATS[1])],
			[null, JSON.stringify(EXAMPLE_TRACK_STATS[2])],
		]),
	} as unknown as ReturnType<typeof redis.pipeline>;
	mockedRedis.pipeline.mockReturnValue(mockPipeline);

	const promise = statsCommandHandler(interaction);

	await promise;

	expect(interaction.reply).toHaveBeenCalledWith('Loading latest stats…');
	expect(mockStatsHandlerInstance.getStats).toHaveBeenCalledWith('play');
	expect(mockStatsHandlerInstance.getStats).toHaveBeenCalledWith('playlist');

	expect(mockedRedis.pipeline).toHaveBeenCalledTimes(1);
	const pipelineInstance = mockedRedis.pipeline();
	expect(pipelineInstance.get).toHaveBeenCalledTimes(3);
	expect(pipelineInstance.get).toHaveBeenCalledWith(EXAMPLE_REDIS_KEYS[0]);
	expect(pipelineInstance.get).toHaveBeenCalledWith(EXAMPLE_REDIS_KEYS[1]);
	expect(pipelineInstance.get).toHaveBeenCalledWith(EXAMPLE_REDIS_KEYS[2]);

	expect(interaction.editReply).toHaveBeenCalledWith({
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

	setupMockStreams(['key1', 'key2']);

	const mockPipeline = {
		get: vi.fn().mockReturnThis(),
		exec: vi.fn().mockResolvedValue([
			[null, JSON.stringify(duplicateTrackStats[0])],
			[null, JSON.stringify(duplicateTrackStats[1])],
		]),
	} as unknown as ReturnType<typeof redis.pipeline>;
	mockedRedis.pipeline.mockReturnValue(mockPipeline);

	const promise = statsCommandHandler(interaction);

	await promise;

	const editReplyCall = vi.mocked(interaction.editReply).mock.calls[0];
	const callArg = editReplyCall?.[0];

	if (isObject(callArg) && 'embeds' in callArg) {
		const embed = (callArg as { embeds: EmbedBuilder[] }).embeds[0];
		expect(embed.data.description).toContain('2 — "Test Song" by Test Artist');
	}
});

it('should skip tracks without `requestedById`', async () => {
	const interaction = createMockInteraction();

	const trackWithoutRequesterId = {
		title: 'Background Track',
		author: 'System',
	};

	setupMockStreams(['key1']);

	const mockPipeline = {
		get: vi.fn().mockReturnThis(),
		exec: vi
			.fn()
			.mockResolvedValue([[null, JSON.stringify(trackWithoutRequesterId)]]),
	} as unknown as ReturnType<typeof redis.pipeline>;
	mockedRedis.pipeline.mockReturnValue(mockPipeline);

	const promise = statsCommandHandler(interaction);

	await promise;

	const editReplyCall = vi.mocked(interaction.editReply).mock.calls[0];
	const callArg = editReplyCall?.[0];

	if (isObject(callArg) && 'embeds' in callArg) {
		const embed = (callArg as { embeds: EmbedBuilder[] }).embeds[0];
		expect(embed.data.description).toContain('*empty*');
		expect(embed.data.fields?.[0]?.value).toBe('0');
	}
});

it('should handle Redis get returning null values', async () => {
	const interaction = createMockInteraction();

	setupMockStreams(['key1']);

	const mockPipeline = {
		get: vi.fn().mockReturnThis(),
		exec: vi.fn().mockResolvedValue([[null, null]]),
	} as unknown as ReturnType<typeof redis.pipeline>;
	mockedRedis.pipeline.mockReturnValue(mockPipeline);

	const promise = statsCommandHandler(interaction);

	await promise;

	const editReplyCall = vi.mocked(interaction.editReply).mock.calls[0];
	const callArg = editReplyCall?.[0];

	if (isObject(callArg) && 'embeds' in callArg) {
		const embed = (callArg as { embeds: EmbedBuilder[] }).embeds[0];
		expect(embed.data.description).toContain('*empty*');
	}
});

it('should handle JSON parsing errors gracefully', async () => {
	const interaction = createMockInteraction();

	setupMockStreams(['key1']);

	const mockPipeline = {
		get: vi.fn().mockReturnThis(),
		exec: vi.fn().mockResolvedValue([[null, 'invalid-json']]),
	} as unknown as ReturnType<typeof redis.pipeline>;
	mockedRedis.pipeline.mockReturnValue(mockPipeline);

	const promise = statsCommandHandler(interaction);

	await promise;

	expect(mockedLogger.error).toHaveBeenCalled();
	expect(mockedCaptureException).toHaveBeenCalled();
});

it('should pause and resume stream during data processing', async () => {
	const interaction = createMockInteraction();

	const { mockPlayStream } = setupMockStreams([EXAMPLE_REDIS_KEYS[0]]);

	const mockPipeline = {
		get: vi.fn().mockReturnThis(),
		exec: vi
			.fn()
			.mockResolvedValue([[null, JSON.stringify(EXAMPLE_TRACK_STATS[0])]]),
	} as unknown as ReturnType<typeof redis.pipeline>;
	mockedRedis.pipeline.mockReturnValue(mockPipeline);

	const promise = statsCommandHandler(interaction);

	await promise;

	expect(mockPlayStream.pause).toHaveBeenCalled();
	expect(mockPlayStream.resume).toHaveBeenCalled();
});

it('should handle empty data arrays and undefined data', async () => {
	const interaction = createMockInteraction();

	setupMockStreams([]);

	const promise = statsCommandHandler(interaction);

	await promise;

	expect(mockedRedis.pipeline).not.toHaveBeenCalled();
});

it('should aggregate stats by user correctly', async () => {
	const interaction = createMockInteraction();

	const statsWithSameUser = [
		{ title: 'Song 1', author: 'Artist 1', requestedById: '123' },
		{ title: 'Song 2', author: 'Artist 2', requestedById: '123' },
		{ title: 'Song 3', author: 'Artist 3', requestedById: '456' },
	];

	setupMockStreams(['key1', 'key2', 'key3']);

	const mockPipeline = {
		get: vi.fn().mockReturnThis(),
		exec: vi.fn().mockResolvedValue([
			[null, JSON.stringify(statsWithSameUser[0])],
			[null, JSON.stringify(statsWithSameUser[1])],
			[null, JSON.stringify(statsWithSameUser[2])],
		]),
	} as unknown as ReturnType<typeof redis.pipeline>;
	mockedRedis.pipeline.mockReturnValue(mockPipeline);

	const promise = statsCommandHandler(interaction);

	await promise;

	const editReplyCall = vi.mocked(interaction.editReply).mock.calls[0];
	const callArg = editReplyCall?.[0];

	if (isObject(callArg) && 'embeds' in callArg) {
		const embed = (callArg as { embeds: EmbedBuilder[] }).embeds[0];
		expect(embed.data.description).toContain('2 — <@!123>');
		expect(embed.data.description).toContain('1 — <@!456>');
	}
});

it('should only show tracks played more than once in top list', async () => {
	const interaction = createMockInteraction();

	const singlePlayStats = [
		{ title: 'Song 1', author: 'Artist 1', requestedById: '123' },
	];

	setupMockStreams(['key1']);

	const mockPipeline = {
		get: vi.fn().mockReturnThis(),
		exec: vi
			.fn()
			.mockResolvedValue([[null, JSON.stringify(singlePlayStats[0])]]),
	} as unknown as ReturnType<typeof redis.pipeline>;
	mockedRedis.pipeline.mockReturnValue(mockPipeline);

	const promise = statsCommandHandler(interaction);

	await promise;

	const editReplyCall = vi.mocked(interaction.editReply).mock.calls[0];
	const callArg = editReplyCall?.[0];

	if (isObject(callArg) && 'embeds' in callArg) {
		const embed = (callArg as { embeds: EmbedBuilder[] }).embeds[0];

		expect(embed.data.description).toContain(
			'**Top 10 Most Frequently Played**:\n*empty*',
		);
		expect(embed.data.footer?.text).toBe('Not showing tracks played just once');
	}
});
