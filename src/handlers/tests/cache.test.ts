import { opendir, stat } from 'node:fs/promises';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { ScanStream } from 'ioredis';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isHomeGuild } from '../../utils/getGuildConfig.ts';
import logger from '../../utils/logger.ts';
import redis from '../../utils/redis.ts';
import cacheCommandHandler, {
	createActionRowWithRemovedButton,
} from '../cache.ts';

vi.mock('../../utils/getEnvironmentVariable', () => ({
	default: vi.fn((key: string) => {
		if (key === 'NODE_ENV') return 'production';
		throw new Error(`Unknown env var: ${key}`);
	}),
}));

vi.mock('../../utils/getGuildConfig', () => ({
	default: vi.fn(() => ({
		playlistsChannelId: 'playlists-channel-123',
		ownerRoleId: 'owner-role-123',
	})),
	isHomeGuild: vi.fn(() => true),
}));

vi.mock('../../utils/OpusCacheManager', () => ({
	OpusCacheManager: {
		getDirectoryPath: vi.fn(() => '/tmp/opus-cache'),
	},
}));

vi.mock('node:fs/promises', () => ({
	opendir: vi.fn(),
	stat: vi.fn(),
}));

const mockOpendir = vi.mocked(opendir);
const mockStat = vi.mocked(stat);
const mockIsHomeGuild = vi.mocked(isHomeGuild);
const mockedLogger = vi.mocked(logger);
const mockedRedis = vi.mocked(redis);

interface MockCollector {
	on: ReturnType<typeof vi.fn>;
	stop?: ReturnType<typeof vi.fn>;
}

interface MockChannel {
	createMessageComponentCollector: (options?: unknown) => MockCollector;
}

interface MockButtonData {
	custom_id: string;
	label: string;
	disabled: boolean;
	style: number;
}

interface MockComponent {
	data: MockButtonData;
}

interface MockActionRow {
	components: MockComponent[];
}

interface MockEditReplyCall {
	embeds?: {
		data: {
			title: string;
			description: string;
			fields: { name: string; value: string }[];
		};
	}[];
	components?: MockActionRow[];
}

function getEditReplyCall(
	interaction: ChatInputCommandInteraction,
): MockEditReplyCall {
	const calls = vi.mocked(interaction.editReply).mock.calls;
	const call = calls[calls.length - 1][0];
	return call as MockEditReplyCall;
}

function createMockInteraction(
	roles: string[] = ['other-role'],
): ChatInputCommandInteraction {
	return {
		guildId: 'guild-123',
		member: { roles },
		reply: vi.fn().mockResolvedValue({}),
		editReply: vi.fn().mockResolvedValue({}),
		channel: {
			createMessageComponentCollector: vi.fn(() => ({
				on: vi.fn(),
			})),
		},
	} as unknown as ChatInputCommandInteraction;
}

function createMockDirectory(files: string[]) {
	let index = 0;
	return {
		[Symbol.asyncIterator]: async function* () {
			while (index < files.length) {
				yield {
					name: files[index],
					isFile: () => true,
				};
				index++;
			}
		},
	};
}

function createScanStream(batches: string[][] = []): ScanStream {
	return {
		async *[Symbol.asyncIterator]() {
			for (const batch of batches) {
				yield batch;
			}
		},
	} as unknown as ScanStream;
}

function createFailingScanStream(error: Error): ScanStream {
	return {
		async *[Symbol.asyncIterator]() {
			yield* [];
			throw error;
		},
	} as unknown as ScanStream;
}

function getScanPattern(options: unknown) {
	return typeof options === 'object' && options !== null && 'match' in options
		? options.match
		: undefined;
}

function getFieldValue(call: MockEditReplyCall, name: string) {
	return call.embeds?.[0]?.data.fields.find((field) => field.name === name)
		?.value;
}

beforeEach(() => {
	vi.clearAllMocks();
	mockedRedis.scanStream.mockImplementation(() => createScanStream());
	mockedRedis.mget.mockResolvedValue([]);
});

describe('cache command handler', () => {
	it('should reply with initial loading message', async () => {
		const mockInteraction = createMockInteraction();
		mockOpendir.mockResolvedValue(createMockDirectory([]) as never);

		await cacheCommandHandler(mockInteraction);

		expect(mockInteraction.editReply).toHaveBeenCalledWith(
			'Loading cache statistics…',
		);
	});

	it('should create cache statistics embed with all cache types', async () => {
		const mockInteraction = createMockInteraction();
		mockOpendir.mockResolvedValue(createMockDirectory([]) as never);

		await cacheCommandHandler(mockInteraction);

		const call = getEditReplyCall(mockInteraction);
		expect(call).toHaveProperty('embeds');

		const embed = call.embeds?.[0];
		expect(embed?.data.title).toBe('Cache Statistics');
		expect(embed?.data.fields).toHaveLength(4);

		const fieldNames = embed?.data.fields.map((field) => field.name);
		expect(fieldNames).toEqual([
			'Query Cache',
			'External Playlist Cache',
			'Opus Cache',
			'Corrected Queries',
		]);
	});

	it('should show zero values for empty caches', async () => {
		const mockInteraction = createMockInteraction();
		mockOpendir.mockResolvedValue(createMockDirectory([]) as never);

		await cacheCommandHandler(mockInteraction);

		const call = getEditReplyCall(mockInteraction);
		const fields = call.embeds?.[0]?.data.fields;

		expect(fields?.find((field) => field.name === 'Query Cache')?.value).toBe(
			'0 entries\n0 B',
		);
		expect(
			fields?.find((field) => field.name === 'External Playlist Cache')?.value,
		).toBe('0 entries\n0 B');
		expect(fields?.find((f) => f.name === 'Opus Cache')?.value).toBe(
			'0 files\n0 B',
		);
	});

	it('should create flush buttons for owner', async () => {
		const mockInteraction = createMockInteraction(['owner-role-123']);
		mockOpendir.mockResolvedValue(createMockDirectory([]) as never);

		await cacheCommandHandler(mockInteraction);

		const call = getEditReplyCall(mockInteraction);
		const components = call.components;

		expect(components).toHaveLength(1);
		expect(components?.[0].components).toHaveLength(2);
		expect(components?.[0].components[0].data.disabled).toBe(false);
		expect(components?.[0].components[1].data.disabled).toBe(false);
	});

	it('should disable flush buttons for non-owner', async () => {
		const mockInteraction = createMockInteraction(['other-role']);
		mockOpendir.mockResolvedValue(createMockDirectory([]) as never);

		await cacheCommandHandler(mockInteraction);

		const call = getEditReplyCall(mockInteraction);
		const components = call.components;

		expect(components?.[0].components[0].data.disabled).toBe(true);
		expect(components?.[0].components[1].data.disabled).toBe(true);
	});

	it('should disable flush buttons for owners outside the home guild', async () => {
		mockIsHomeGuild.mockReturnValueOnce(false);
		const mockInteraction = createMockInteraction(['owner-role-123']);
		mockOpendir.mockResolvedValue(createMockDirectory([]) as never);

		await cacheCommandHandler(mockInteraction);

		const call = getEditReplyCall(mockInteraction);
		const components = call.components;

		expect(components?.[0].components[0].data.disabled).toBe(true);
		expect(components?.[0].components[1].data.disabled).toBe(true);
	});

	it('should handle file system errors gracefully', async () => {
		const mockInteraction = createMockInteraction();
		mockOpendir.mockRejectedValue(new Error('Directory access denied'));

		await cacheCommandHandler(mockInteraction);

		const call = getEditReplyCall(mockInteraction);
		const opusCacheField = call.embeds?.[0]?.data.fields.find(
			(field) => field.name === 'Opus Cache',
		);

		expect(opusCacheField?.value).toBe('0 files\n0 B');
	});

	it('should format file sizes correctly', async () => {
		const mockInteraction = createMockInteraction();
		mockOpendir.mockResolvedValue(
			createMockDirectory(['large-file.opus']) as never,
		);

		mockStat.mockResolvedValue({ size: 1024 * 1024 * 5 } as never);

		await cacheCommandHandler(mockInteraction);

		const call = getEditReplyCall(mockInteraction);
		const opusCacheField = call.embeds?.[0]?.data.fields.find(
			(field) => field.name === 'Opus Cache',
		);

		expect(opusCacheField?.value).toContain('5.24 MB');
	});

	it('should handle `pluralize` correctly for single items', async () => {
		const mockInteraction = createMockInteraction();
		mockOpendir.mockResolvedValue(
			createMockDirectory(['single-file.opus']) as never,
		);

		mockStat.mockResolvedValue({ size: 1024 } as never);

		await cacheCommandHandler(mockInteraction);

		const call = getEditReplyCall(mockInteraction);
		const opusCacheField = call.embeds?.[0]?.data.fields.find(
			(field) => field.name === 'Opus Cache',
		);

		expect(opusCacheField?.value).toContain('1 file');
	});

	it('should set up message component collector', async () => {
		const mockInteraction = createMockInteraction(['owner-role-123']);
		const mockCollector = { on: vi.fn() };
		const mockCreateCollector = vi.fn(() => mockCollector as never);

		if (mockInteraction.channel) {
			(
				mockInteraction.channel as unknown as MockChannel
			).createMessageComponentCollector = mockCreateCollector;
		}

		mockOpendir.mockResolvedValue(createMockDirectory([]) as never);

		await cacheCommandHandler(mockInteraction);

		expect(mockCreateCollector).toHaveBeenCalledWith({
			componentType: 2,
			time: 60000,
		});
		expect(mockCollector.on).toHaveBeenCalledWith(
			'collect',
			expect.any(Function),
		);
		expect(mockCollector.on).toHaveBeenCalledWith('end', expect.any(Function));
	});

	it('should report zeroed stats when Redis scanning fails', async () => {
		const mockInteraction = createMockInteraction();
		const scanError = new Error('Redis connection failed');
		mockOpendir.mockResolvedValue(createMockDirectory([]) as never);

		mockedRedis.scanStream.mockImplementation((options) =>
			getScanPattern(options) === 'discord-player:query-cache:*'
				? createFailingScanStream(scanError)
				: createScanStream([['key1']]),
		);
		mockedRedis.mget.mockResolvedValue(['abc']);

		await cacheCommandHandler(mockInteraction);

		expect(mockedLogger.error).toHaveBeenCalledWith(
			scanError,
			'Failed to scan Redis cache for pattern discord-player:query-cache:*:',
		);

		const call = getEditReplyCall(mockInteraction);

		expect(getFieldValue(call, 'Query Cache')).toBe('0 entries\n0 B');
		expect(getFieldValue(call, 'External Playlist Cache')).toBe('1 entry\n3 B');
	});

	it('should count keys and value sizes across Redis batches', async () => {
		const mockInteraction = createMockInteraction();
		mockOpendir.mockResolvedValue(createMockDirectory([]) as never);

		mockedRedis.scanStream.mockImplementation((options) =>
			getScanPattern(options) === 'discord-player:query-cache:*'
				? createScanStream([['key1', 'key2'], [], ['key3']])
				: createScanStream(),
		);
		mockedRedis.mget
			.mockResolvedValueOnce(['{"test": "data"}', null])
			.mockResolvedValueOnce(['abcd']);

		await cacheCommandHandler(mockInteraction);

		expect(mockedRedis.mget).toHaveBeenCalledTimes(2);
		expect(mockedRedis.mget).toHaveBeenCalledWith(['key1', 'key2']);
		expect(mockedRedis.mget).toHaveBeenCalledWith(['key3']);

		const call = getEditReplyCall(mockInteraction);

		expect(getFieldValue(call, 'Query Cache')).toBe('3 entries\n20 B');
		expect(getFieldValue(call, 'Corrected Queries')).toBe('0 queries\n0 B');
	});

	it('should keep scanning when a Redis batch fails to load', async () => {
		const mockInteraction = createMockInteraction();
		const batchError = new Error('MGET failed');
		mockOpendir.mockResolvedValue(createMockDirectory([]) as never);

		mockedRedis.scanStream.mockImplementation((options) =>
			getScanPattern(options) === 'external-playlist-cache:*'
				? createScanStream([['key1'], ['key2']])
				: createScanStream(),
		);
		mockedRedis.mget
			.mockRejectedValueOnce(batchError)
			.mockResolvedValueOnce(['ab']);

		await cacheCommandHandler(mockInteraction);

		expect(mockedLogger.error).toHaveBeenCalledWith(
			batchError,
			'Failed to process Redis cache batch for pattern external-playlist-cache:*:',
		);
		expect(
			getFieldValue(
				getEditReplyCall(mockInteraction),
				'External Playlist Cache',
			),
		).toBe('1 entry\n2 B');
	});

	it('should handle non-owner button clicks with error message', async () => {
		const mockInteraction = createMockInteraction(['owner-role-123']);
		const mockButtonInteraction = {
			member: { roles: ['other-role'] },
			customId: 'flush_query_cache',
			reply: vi.fn().mockResolvedValue({}),
		};

		const mockCollector = {
			on: vi.fn(),
			stop: vi.fn(),
		};

		const mockCreateCollector = vi.fn(() => mockCollector);

		if (mockInteraction.channel) {
			(
				mockInteraction.channel as unknown as MockChannel
			).createMessageComponentCollector = mockCreateCollector;
		}

		mockOpendir.mockResolvedValue(createMockDirectory([]) as never);

		await cacheCommandHandler(mockInteraction);

		const collectCallback = mockCollector.on.mock.calls.find(
			(call) => call[0] === 'collect',
		)?.[1];

		expect(collectCallback).toBeDefined();

		await collectCallback(mockButtonInteraction);

		expect(mockButtonInteraction.reply).toHaveBeenCalledWith({
			content: 'Only the bot owner can use these buttons.',
			flags: ['Ephemeral'],
		});
	});

	it('should handle unknown button actions', async () => {
		const mockInteraction = createMockInteraction(['owner-role-123']);
		const mockButtonInteraction = {
			member: { roles: ['owner-role-123'] },
			customId: 'unknown_action',
			update: vi.fn().mockResolvedValue({}),
		};

		const mockCollector = {
			on: vi.fn(),
			stop: vi.fn(),
		};

		const mockCreateCollector = vi.fn(() => mockCollector);

		if (mockInteraction.channel) {
			(
				mockInteraction.channel as unknown as MockChannel
			).createMessageComponentCollector = mockCreateCollector;
		}

		mockOpendir.mockResolvedValue(createMockDirectory([]) as never);

		await cacheCommandHandler(mockInteraction);

		const collectCallback = mockCollector.on.mock.calls.find(
			(call) => call[0] === 'collect',
		)?.[1];

		expect(collectCallback).toBeDefined();

		await collectCallback(mockButtonInteraction);

		expect(mockButtonInteraction.update).toHaveBeenCalled();
	});

	it('should handle individual file stat errors in opus cache', async () => {
		const mockInteraction = createMockInteraction();

		const mockDirectory = {
			[Symbol.asyncIterator]: async function* () {
				yield {
					name: 'good-file.opus',
					isFile: () => true,
				};
				yield {
					name: 'bad-file.opus',
					isFile: () => true,
				};
			},
		};

		mockOpendir.mockResolvedValue(mockDirectory as never);
		mockStat
			.mockResolvedValueOnce({ size: 1024 } as never)
			.mockRejectedValueOnce(new Error('Permission denied'));

		await cacheCommandHandler(mockInteraction);

		const call = getEditReplyCall(mockInteraction);
		const opusCacheField = call.embeds?.[0]?.data.fields.find(
			(field) => field.name === 'Opus Cache',
		);

		expect(opusCacheField?.value).toContain('1 file');
		expect(opusCacheField?.value).toContain('1.02 kB');
	});

	it('should skip button processing if already deferred', async () => {
		const mockInteraction = createMockInteraction(['owner-role-123']);
		const mockButtonInteraction = {
			member: { roles: ['owner-role-123'] },
			customId: 'flush_query_cache',
			deferred: true,
			replied: false,
			update: vi.fn().mockResolvedValue({}),
		};

		const mockCollector = {
			on: vi.fn(),
			stop: vi.fn(),
		};

		const mockCreateCollector = vi.fn(() => mockCollector);

		if (mockInteraction.channel) {
			(
				mockInteraction.channel as unknown as MockChannel
			).createMessageComponentCollector = mockCreateCollector;
		}

		mockOpendir.mockResolvedValue(createMockDirectory([]) as never);

		await cacheCommandHandler(mockInteraction);

		const collectCallback = mockCollector.on.mock.calls.find(
			(call) => call[0] === 'collect',
		)?.[1];

		expect(collectCallback).toBeDefined();

		await collectCallback(mockButtonInteraction);

		expect(mockButtonInteraction.update).not.toHaveBeenCalled();
	});

	it('should skip button processing if already replied', async () => {
		const mockInteraction = createMockInteraction(['owner-role-123']);
		const mockButtonInteraction = {
			member: { roles: ['owner-role-123'] },
			customId: 'flush_query_cache',
			deferred: false,
			replied: true,
			update: vi.fn().mockResolvedValue({}),
		};

		const mockCollector = {
			on: vi.fn(),
			stop: vi.fn(),
		};

		const mockCreateCollector = vi.fn(() => mockCollector);

		if (mockInteraction.channel) {
			(
				mockInteraction.channel as unknown as MockChannel
			).createMessageComponentCollector = mockCreateCollector;
		}

		mockOpendir.mockResolvedValue(createMockDirectory([]) as never);

		await cacheCommandHandler(mockInteraction);

		const collectCallback = mockCollector.on.mock.calls.find(
			(call) => call[0] === 'collect',
		)?.[1];

		expect(collectCallback).toBeDefined();

		await collectCallback(mockButtonInteraction);

		expect(mockButtonInteraction.update).not.toHaveBeenCalled();
	});

	it('should handle collector end event', async () => {
		const mockInteraction = createMockInteraction(['owner-role-123']);

		const mockCollector = {
			on: vi.fn(),
			stop: vi.fn(),
		};

		const mockCreateCollector = vi.fn(() => mockCollector);

		if (mockInteraction.channel) {
			(
				mockInteraction.channel as unknown as MockChannel
			).createMessageComponentCollector = mockCreateCollector;
		}

		mockOpendir.mockResolvedValue(createMockDirectory([]) as never);

		await cacheCommandHandler(mockInteraction);

		const endCallback = mockCollector.on.mock.calls.find(
			(call) => call[0] === 'end',
		)?.[1];

		expect(endCallback).toBeDefined();

		await endCallback();

		expect(mockInteraction.editReply).toHaveBeenCalled();
	});

	it('should handle collector end event errors gracefully', async () => {
		const mockInteraction = createMockInteraction(['owner-role-123']);

		const mockCollector = {
			on: vi.fn(),
			stop: vi.fn(),
		};

		const mockCreateCollector = vi.fn(() => mockCollector);

		if (mockInteraction.channel) {
			(
				mockInteraction.channel as unknown as MockChannel
			).createMessageComponentCollector = mockCreateCollector;
		}

		mockOpendir.mockResolvedValue(createMockDirectory([]) as never);

		mockInteraction.editReply = vi
			.fn()
			.mockResolvedValueOnce({})
			.mockRejectedValueOnce(new Error('Edit failed'));

		await cacheCommandHandler(mockInteraction);

		const endCallback = mockCollector.on.mock.calls.find(
			(call) => call[0] === 'end',
		)?.[1];

		expect(endCallback).toBeDefined();

		await endCallback();

		expect(mockInteraction.editReply).toHaveBeenCalled();
	});

	it('should show updated stats when clicking multiple flush buttons sequentially', async () => {
		const mockInteraction = createMockInteraction(['owner-role-123']);

		const mockCollector = {
			on: vi.fn(),
			stop: vi.fn(),
		};

		const mockCreateCollector = vi.fn(() => mockCollector);

		if (mockInteraction.channel) {
			(
				mockInteraction.channel as unknown as MockChannel
			).createMessageComponentCollector = mockCreateCollector;
		}

		mockOpendir.mockResolvedValue(createMockDirectory([]) as never);

		const cachedKeys = new Map([
			['discord-player:query-cache:*', ['query-key-1', 'query-key-2']],
			['external-playlist-cache:*', ['playlist-key-1', 'playlist-key-2']],
		]);
		const mockPipeline = {
			del: vi.fn().mockReturnThis(),
			exec: vi.fn().mockResolvedValue([]),
		};

		mockedRedis.pipeline.mockReturnValue(mockPipeline as never);
		mockedRedis.scanStream.mockImplementation((options) => {
			const pattern = getScanPattern(options);
			const keys = typeof pattern === 'string' ? cachedKeys.get(pattern) : [];

			if (!keys) {
				return createScanStream();
			}

			if (typeof pattern === 'string' && options?.count === 500) {
				cachedKeys.delete(pattern);
			}

			return createScanStream([keys]);
		});

		mockedRedis.mget.mockResolvedValue(['data1', 'data2']);

		await cacheCommandHandler(mockInteraction);

		const collectCallback = mockCollector.on.mock.calls.find(
			(call) => call[0] === 'collect',
		)?.[1];

		expect(collectCallback).toBeDefined();

		const firstButtonInteraction = {
			member: { roles: ['owner-role-123'] },
			customId: 'flush_query_cache',
			deferred: false,
			replied: false,
			update: vi.fn().mockResolvedValue({}),
		};

		await collectCallback(firstButtonInteraction);

		expect(firstButtonInteraction.update).toHaveBeenCalled();

		const firstUpdateCall = vi.mocked(firstButtonInteraction.update).mock
			.calls[0][0] as MockEditReplyCall;

		const firstUpdateEmbed = firstUpdateCall.embeds?.[0];
		const firstQueryCacheField = firstUpdateEmbed?.data.fields.find(
			(field) => field.name === 'Query Cache',
		);

		expect(firstQueryCacheField?.value).toContain('2 entries');
		expect(mockPipeline.del).toHaveBeenCalledWith('query-key-1');
		expect(mockPipeline.del).toHaveBeenCalledWith('query-key-2');
		expect(mockPipeline.del).not.toHaveBeenCalledWith('playlist-key-1');

		const secondButtonInteraction = {
			member: { roles: ['owner-role-123'] },
			customId: 'flush_external_playlist_cache',
			deferred: false,
			replied: false,
			update: vi.fn().mockResolvedValue({}),
		};

		await collectCallback(secondButtonInteraction);

		expect(secondButtonInteraction.update).toHaveBeenCalled();

		const secondUpdateCall = vi.mocked(secondButtonInteraction.update).mock
			.calls[0][0] as MockEditReplyCall;

		const secondUpdateEmbed = secondUpdateCall.embeds?.[0];
		const secondQueryCacheField = secondUpdateEmbed?.data.fields.find(
			(field) => field.name === 'Query Cache',
		);

		expect(secondQueryCacheField?.value).toContain('0 entries');
		expect(mockPipeline.del).toHaveBeenCalledWith('playlist-key-1');
		expect(mockPipeline.del).toHaveBeenCalledWith('playlist-key-2');

		const finalCall = getEditReplyCall(mockInteraction);

		expect(getFieldValue(finalCall, 'Query Cache')).toBe('0 entries\n0 B');
		expect(getFieldValue(finalCall, 'External Playlist Cache')).toBe(
			'0 entries\n0 B',
		);
	});
});

describe('createActionRowWithRemovedButton', () => {
	it('should remove flush_query_cache button and keep flush_external_playlist_cache', () => {
		const row = createActionRowWithRemovedButton('flush_query_cache');

		expect(row.components).toHaveLength(1);

		const remainingButton = row.components[0].data as MockButtonData;

		expect(remainingButton.custom_id).toBe('flush_external_playlist_cache');
		expect(remainingButton.label).toBe('Flush playlist cache');
		expect(remainingButton.disabled).toBe(false);
	});

	it('should remove flush_external_playlist_cache button and keep flush_query_cache', () => {
		const row = createActionRowWithRemovedButton(
			'flush_external_playlist_cache',
		);

		expect(row.components).toHaveLength(1);

		const remainingButton = row.components[0].data as MockButtonData;

		expect(remainingButton.custom_id).toBe('flush_query_cache');
		expect(remainingButton.label).toBe('Flush query cache');
		expect(remainingButton.disabled).toBe(false);
	});

	it('should keep both buttons when removing unknown button', () => {
		const row = createActionRowWithRemovedButton('unknown_button');

		expect(row.components).toHaveLength(2);

		const firstButton = row.components[0].data as MockButtonData;
		const secondButton = row.components[1].data as MockButtonData;

		expect(firstButton.custom_id).toBe('flush_query_cache');
		expect(secondButton.custom_id).toBe('flush_external_playlist_cache');
	});

	it('should return empty row when all buttons are removed', () => {
		const row = createActionRowWithRemovedButton('flush_query_cache');
		expect(row.components).toHaveLength(1);

		const remainingButtons = [
			{ customId: 'flush_query_cache', label: 'Flush query cache' },
			{
				customId: 'flush_external_playlist_cache',
				label: 'Flush playlist cache',
			},
		].filter(
			(button) =>
				button.customId !== 'flush_query_cache' &&
				button.customId !== 'flush_external_playlist_cache',
		);

		expect(remainingButtons).toHaveLength(0);
	});
});

describe('cache flush error handling', () => {
	it('should handle flush query cache Redis pipeline error gracefully', async () => {
		const mockInteraction = createMockInteraction(['owner-role-123']);

		const mockCollector = {
			on: vi.fn(),
			stop: vi.fn(),
		};

		const mockCreateCollector = vi.fn(() => mockCollector);

		if (mockInteraction.channel) {
			(
				mockInteraction.channel as unknown as MockChannel
			).createMessageComponentCollector = mockCreateCollector;
		}

		mockOpendir.mockResolvedValue(createMockDirectory([]) as never);

		mockedRedis.scanStream.mockImplementation((options) =>
			getScanPattern(options) === 'discord-player:query-cache:*'
				? createScanStream([['query-key-1']])
				: createScanStream(),
		);

		const mockPipeline = {
			del: vi.fn().mockReturnThis(),
			exec: vi.fn().mockRejectedValue(new Error('Redis pipeline failed')),
		};

		mockedRedis.pipeline.mockReturnValue(mockPipeline as never);

		await cacheCommandHandler(mockInteraction);

		const collectCallback = mockCollector.on.mock.calls.find(
			(call) => call[0] === 'collect',
		)?.[1];

		expect(collectCallback).toBeDefined();

		const buttonInteraction = {
			member: { roles: ['owner-role-123'] },
			customId: 'flush_query_cache',
			deferred: false,
			replied: false,
			update: vi.fn().mockResolvedValue({}),
		};

		await collectCallback(buttonInteraction);

		expect(buttonInteraction.update).toHaveBeenCalled();
		expect(mockPipeline.del).toHaveBeenCalledWith('query-key-1');
		expect(mockedLogger.error).toHaveBeenCalledWith(
			expect.any(Error),
			'Failed to delete keys matching discord-player:query-cache:* from Redis',
		);
		expect(mockInteraction.editReply).toHaveBeenLastCalledWith(
			expect.objectContaining({ embeds: expect.any(Array) }),
		);
	});

	it('should handle flush external playlist cache Redis pipeline error gracefully', async () => {
		const mockInteraction = createMockInteraction(['owner-role-123']);

		const mockCollector = {
			on: vi.fn(),
			stop: vi.fn(),
		};

		const mockCreateCollector = vi.fn(() => mockCollector);

		if (mockInteraction.channel) {
			(
				mockInteraction.channel as unknown as MockChannel
			).createMessageComponentCollector = mockCreateCollector;
		}

		mockOpendir.mockResolvedValue(createMockDirectory([]) as never);

		mockedRedis.scanStream.mockImplementation((options) =>
			getScanPattern(options) === 'external-playlist-cache:*'
				? createScanStream([['playlist-key-1']])
				: createScanStream(),
		);

		const mockPipeline = {
			del: vi.fn().mockReturnThis(),
			exec: vi.fn().mockRejectedValue(new Error('Redis pipeline failed')),
		};

		mockedRedis.pipeline.mockReturnValue(mockPipeline as never);

		await cacheCommandHandler(mockInteraction);

		const collectCallback = mockCollector.on.mock.calls.find(
			(call) => call[0] === 'collect',
		)?.[1];

		expect(collectCallback).toBeDefined();

		const buttonInteraction = {
			member: { roles: ['owner-role-123'] },
			customId: 'flush_external_playlist_cache',
			deferred: false,
			replied: false,
			update: vi.fn().mockResolvedValue({}),
		};

		await collectCallback(buttonInteraction);

		expect(buttonInteraction.update).toHaveBeenCalled();
		expect(mockPipeline.del).toHaveBeenCalledWith('playlist-key-1');
		expect(mockedLogger.error).toHaveBeenCalledWith(
			expect.any(Error),
			'Failed to delete keys matching external-playlist-cache:* from Redis',
		);
		expect(mockInteraction.editReply).toHaveBeenLastCalledWith(
			expect.objectContaining({ embeds: expect.any(Array) }),
		);
	});
});
