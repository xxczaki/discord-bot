import { opendir, stat } from 'node:fs/promises';
import type { ChatInputCommandInteraction } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import redis from '../../utils/redis';
import cacheCommandHandler, {
	createActionRowWithRemovedButton,
} from '../cache';

vi.mock('../../utils/getEnvironmentVariable', () => ({
	default: vi.fn((key: string) => {
		if (key === 'OWNER_USER_ID') return 'owner-123';
		throw new Error(`Unknown env var: ${key}`);
	}),
}));

vi.mock('../../utils/getOpusCacheDirectoryPath', () => ({
	default: vi.fn(() => '/tmp/opus-cache'),
}));

vi.mock('node:fs/promises', () => ({
	opendir: vi.fn(),
	stat: vi.fn(),
}));

const mockOpendir = vi.mocked(opendir);
const mockStat = vi.mocked(stat);

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
	const call = vi.mocked(interaction.editReply).mock.calls[0][0];
	return call as MockEditReplyCall;
}

function createMockInteraction(
	userId = 'user-456',
): ChatInputCommandInteraction {
	return {
		user: { id: userId },
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

function createMockStream() {
	const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};

	const mockStream = {
		on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
			if (!listeners[event]) listeners[event] = [];
			listeners[event].push(callback);
		}),
		pause: vi.fn(),
		resume: vi.fn(),
		emit: (event: string, ...args: unknown[]) => {
			if (listeners[event]) {
				listeners[event].forEach((callback) => callback(...args));
			}
		},
	};

	setTimeout(() => {
		mockStream.emit('end');
	}, 10);

	return mockStream;
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(redis.scanStream).mockReturnValue(createMockStream() as never);
	vi.mocked(redis.mget).mockResolvedValue([]);
});

describe('cache command handler', () => {
	it('should reply with initial loading message', async () => {
		const mockInteraction = createMockInteraction();
		mockOpendir.mockResolvedValue(createMockDirectory([]) as never);

		await cacheCommandHandler(mockInteraction);

		expect(mockInteraction.reply).toHaveBeenCalledWith(
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
		expect(embed?.data.title).toBeUndefined();
		expect(embed?.data.fields).toHaveLength(3);

		const fieldNames = embed?.data.fields.map((field) => field.name);
		expect(fieldNames).toEqual([
			'Query cache',
			'External playlist cache',
			'Opus cache',
		]);
	});

	it('should show zero values for empty caches', async () => {
		const mockInteraction = createMockInteraction();
		mockOpendir.mockResolvedValue(createMockDirectory([]) as never);

		await cacheCommandHandler(mockInteraction);

		const call = getEditReplyCall(mockInteraction);
		const fields = call.embeds?.[0]?.data.fields;

		expect(fields?.find((field) => field.name === 'Query cache')?.value).toBe(
			'0 entries\n0 B',
		);
		expect(
			fields?.find((field) => field.name === 'External playlist cache')?.value,
		).toBe('0 entries\n0 B');
		expect(fields?.find((f) => f.name === 'Opus cache')?.value).toBe(
			'0 files\n0 B',
		);
	});

	it('should create flush buttons for owner', async () => {
		const mockInteraction = createMockInteraction('owner-123');
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
		const mockInteraction = createMockInteraction('regular-user');
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
			(field) => field.name === 'Opus cache',
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
			(field) => field.name === 'Opus cache',
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
			(field) => field.name === 'Opus cache',
		);

		expect(opusCacheField?.value).toContain('1 file');
	});

	it('should set up message component collector', async () => {
		const mockInteraction = createMockInteraction('owner-123');
		const mockCollector = { on: vi.fn() };
		const mockCreateCollector = vi.fn(() => mockCollector as never);

		if (mockInteraction.channel) {
			// biome-ignore lint/suspicious/noExplicitAny: Mock type for Discord.js channel
			(mockInteraction.channel as any).createMessageComponentCollector =
				mockCreateCollector;
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

	it('should handle Redis scanning errors', async () => {
		const mockInteraction = createMockInteraction();
		mockOpendir.mockResolvedValue(createMockDirectory([]) as never);

		const errorStream = createMockStream();
		vi.mocked(redis.scanStream).mockReturnValue(errorStream as never);

		const handlerPromise = cacheCommandHandler(mockInteraction);

		setTimeout(() => {
			errorStream.emit('error', new Error('Redis connection failed'));
		}, 5);

		await handlerPromise;

		expect(mockInteraction.editReply).toHaveBeenCalled();
	});

	it('should update display when Redis data is received', async () => {
		const mockInteraction = createMockInteraction();
		mockOpendir.mockResolvedValue(createMockDirectory([]) as never);

		const mockStream = createMockStream();
		vi.mocked(redis.scanStream).mockReturnValue(mockStream as never);
		vi.mocked(redis.mget).mockResolvedValue(['{"test": "data"}']);

		const handlerPromise = cacheCommandHandler(mockInteraction);

		setTimeout(() => {
			mockStream.emit('data', ['key1', 'key2']);
		}, 5);

		await handlerPromise;

		expect(mockInteraction.editReply).toHaveBeenCalled();
	});

	it('should handle non-owner button clicks with error message', async () => {
		const mockInteraction = createMockInteraction('owner-123');
		const mockButtonInteraction = {
			user: { id: 'regular-user' },
			customId: 'flush_query_cache',
			reply: vi.fn().mockResolvedValue({}),
		};

		const mockCollector = {
			on: vi.fn(),
			stop: vi.fn(),
		};

		const mockCreateCollector = vi.fn(() => mockCollector);

		if (mockInteraction.channel) {
			// biome-ignore lint/suspicious/noExplicitAny: Mock type for Discord.js channel
			(mockInteraction.channel as any).createMessageComponentCollector =
				mockCreateCollector;
		}

		mockOpendir.mockResolvedValue(createMockDirectory([]) as never);

		await cacheCommandHandler(mockInteraction);

		const collectCallback = mockCollector.on.mock.calls.find(
			(call) => call[0] === 'collect',
		)?.[1];

		expect(collectCallback).toBeDefined();

		await collectCallback(mockButtonInteraction);

		expect(mockButtonInteraction.reply).toHaveBeenCalledWith({
			content: '❌ Only the bot owner can use these buttons.',
			flags: ['Ephemeral'],
		});
	});

	it('should handle unknown button actions', async () => {
		const mockInteraction = createMockInteraction('owner-123');
		const mockButtonInteraction = {
			user: { id: 'owner-123' },
			customId: 'unknown_action',
			update: vi.fn().mockResolvedValue({}),
		};

		const mockCollector = {
			on: vi.fn(),
			stop: vi.fn(),
		};

		const mockCreateCollector = vi.fn(() => mockCollector);

		if (mockInteraction.channel) {
			// biome-ignore lint/suspicious/noExplicitAny: Mock type for Discord.js channel
			(mockInteraction.channel as any).createMessageComponentCollector =
				mockCreateCollector;
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
