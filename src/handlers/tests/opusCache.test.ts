import type { Stats } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { captureException } from '@sentry/node';
import type { ChatInputCommandInteraction } from 'discord.js';
import prettyBytes from 'pretty-bytes';
import { type MockedFunction, beforeEach, expect, it, vi } from 'vitest';
import logger from '../../utils/logger';

const MOCK_CACHE_DIRECTORY = '/mock/opus-cache';
const EXAMPLE_FILE_NAMES = ['track1.opus', 'track2.opus', 'track3.opus'];
const EXAMPLE_FILE_SIZES = [1024, 2048, 4096];

vi.mock('node:fs/promises', () => ({
	readdir: vi.fn(),
	stat: vi.fn(),
}));

vi.mock('node:path', () => ({
	join: vi.fn(),
}));

vi.mock('../../utils/getOpusCacheDirectoryPath', () => ({
	default: vi.fn(() => MOCK_CACHE_DIRECTORY),
}));

vi.mock('pretty-bytes', () => ({
	default: vi.fn(),
}));

const mockedReaddir = vi.mocked(readdir);
const mockedStat = vi.mocked(stat);
const mockedJoin = vi.mocked(join);
const mockedPrettyBytes = vi.mocked(prettyBytes);
const mockedLogger = vi.mocked(logger);
const mockedCaptureException = vi.mocked(captureException);

function createMockInteraction(): ChatInputCommandInteraction {
	return {
		reply: vi.fn().mockResolvedValue({}),
		editReply: vi.fn().mockResolvedValue({}),
	} as unknown as ChatInputCommandInteraction;
}

function createMockStats(size: number): Stats {
	return { size } as Stats;
}

beforeEach(async () => {
	vi.clearAllMocks();
	mockedJoin.mockImplementation((dir, file) => `${dir}/${file}`);
	mockedPrettyBytes.mockImplementation((bytes) => `${bytes} B`);

	vi.resetModules();
});

it('should fetch cache details and display correct summary', async () => {
	const { default: opusCacheCommandHandler } = await import('../opusCache');
	const interaction = createMockInteraction();
	const totalSize = EXAMPLE_FILE_SIZES.reduce((acc, size) => acc + size, 0);

	(
		mockedReaddir as unknown as MockedFunction<() => Promise<string[]>>
	).mockResolvedValue(EXAMPLE_FILE_NAMES);
	mockedStat
		.mockResolvedValueOnce(createMockStats(EXAMPLE_FILE_SIZES[0]))
		.mockResolvedValueOnce(createMockStats(EXAMPLE_FILE_SIZES[1]))
		.mockResolvedValueOnce(createMockStats(EXAMPLE_FILE_SIZES[2]));

	await opusCacheCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith(
		'Fetching the details about the cache…',
	);

	expect(mockedReaddir).toHaveBeenCalledWith(MOCK_CACHE_DIRECTORY);
	expect(mockedJoin).toHaveBeenCalledTimes(EXAMPLE_FILE_NAMES.length);

	for (const fileName of EXAMPLE_FILE_NAMES) {
		expect(mockedJoin).toHaveBeenCalledWith(MOCK_CACHE_DIRECTORY, fileName);
	}

	expect(mockedPrettyBytes).toHaveBeenCalledWith(totalSize);

	expect(interaction.editReply).toHaveBeenCalledWith(
		expect.stringContaining(
			`Currently storing ${EXAMPLE_FILE_NAMES.length} cached [Opus](<https://opus-codec.org/>) files (total: ${totalSize} B).`,
		),
	);
});

it('should handle single file correctly', async () => {
	const { default: opusCacheCommandHandler } = await import('../opusCache');
	const interaction = createMockInteraction();
	const singleFile = ['single-track.opus'];
	const singleSize = 512;

	(
		mockedReaddir as unknown as MockedFunction<() => Promise<string[]>>
	).mockResolvedValue(singleFile);
	mockedStat.mockResolvedValue(createMockStats(singleSize));

	await opusCacheCommandHandler(interaction);

	expect(interaction.editReply).toHaveBeenCalledWith(
		expect.stringContaining(
			`Currently storing ${singleFile.length} cached [Opus](<https://opus-codec.org/>) file (total: ${singleSize} B).`,
		),
	);
});

it('should handle empty cache directory', async () => {
	const { default: opusCacheCommandHandler } = await import('../opusCache');
	const interaction = createMockInteraction();

	(
		mockedReaddir as unknown as MockedFunction<() => Promise<string[]>>
	).mockResolvedValue([]);

	await opusCacheCommandHandler(interaction);

	expect(interaction.editReply).toHaveBeenCalledWith(
		expect.stringContaining(
			'Currently storing 0 cached [Opus](<https://opus-codec.org/>) files (total: 0 B).',
		),
	);
});

it('should handle readdir error and reply with error message', async () => {
	const { default: opusCacheCommandHandler } = await import('../opusCache');
	const interaction = createMockInteraction();
	const error = new Error('Permission denied');

	mockedReaddir.mockRejectedValue(error);

	await opusCacheCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith(
		'Fetching the details about the cache…',
	);

	expect(mockedLogger.error).toHaveBeenCalledWith(error);
	expect(mockedCaptureException).toHaveBeenCalledWith(error);

	expect(interaction.editReply).toHaveBeenCalledWith(
		'❌ Something went wrong when trying to read the cache directory.',
	);
});

it('should handle stat error and reply with error message', async () => {
	const { default: opusCacheCommandHandler } = await import('../opusCache');
	const interaction = createMockInteraction();
	const error = new Error('File not found');

	(
		mockedReaddir as unknown as MockedFunction<() => Promise<string[]>>
	).mockResolvedValue(EXAMPLE_FILE_NAMES);
	mockedStat.mockRejectedValue(error);

	await opusCacheCommandHandler(interaction);

	expect(mockedLogger.error).toHaveBeenCalledWith(error);
	expect(mockedCaptureException).toHaveBeenCalledWith(error);

	expect(interaction.editReply).toHaveBeenCalledWith(
		'❌ Something went wrong when trying to read the cache directory.',
	);
});
