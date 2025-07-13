import type { Dir, Dirent, Stats } from 'node:fs';
import { opendir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { captureException } from '@sentry/node';
import type { ChatInputCommandInteraction } from 'discord.js';
import prettyBytes from 'pretty-bytes';
import { beforeEach, expect, it, type MockedFunction, vi } from 'vitest';
import logger from '../../utils/logger';
import opusCacheCommandHandler from '../opusCache';

const MOCK_CACHE_DIRECTORY = vi.hoisted(() => '/mock/opus-cache');
const EXAMPLE_FILE_NAMES = ['track1.opus', 'track2.opus', 'track3.opus'];
const EXAMPLE_FILE_SIZES = [1024, 2048, 4096];

vi.mock('node:fs/promises', () => ({
	opendir: vi.fn(),
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

const mockedOpendir = vi.mocked(opendir);
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

function createMockDirEntry(name: string, isFile = true): Dirent {
	return {
		name,
		isFile: vi.fn().mockReturnValue(isFile),
	} as unknown as Dirent;
}

function createMockDir(entries: { name: string; isFile?: boolean }[]): Dir {
	const mockEntries = entries.map((entry) =>
		createMockDirEntry(entry.name, entry.isFile ?? true),
	);

	return {
		[Symbol.asyncIterator]: async function* () {
			for (const entry of mockEntries) {
				yield entry;
			}
		},
	} as unknown as Dir;
}

beforeEach(async () => {
	vi.clearAllMocks();
	mockedJoin.mockImplementation((dir, file) => `${dir}/${file}`);
	mockedPrettyBytes.mockImplementation((bytes) => `${bytes} B`);
});

it('should fetch cache details and display correct summary', async () => {
	const interaction = createMockInteraction();
	const totalSize = EXAMPLE_FILE_SIZES.reduce((acc, size) => acc + size, 0);

	const mockDir = createMockDir(EXAMPLE_FILE_NAMES.map((name) => ({ name })));
	(mockedOpendir as MockedFunction<typeof opendir>).mockResolvedValue(mockDir);

	mockedStat
		.mockResolvedValueOnce(createMockStats(EXAMPLE_FILE_SIZES[0]))
		.mockResolvedValueOnce(createMockStats(EXAMPLE_FILE_SIZES[1]))
		.mockResolvedValueOnce(createMockStats(EXAMPLE_FILE_SIZES[2]));

	await opusCacheCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith('Scanning cache directory…');

	expect(mockedOpendir).toHaveBeenCalledWith(MOCK_CACHE_DIRECTORY);
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
	const interaction = createMockInteraction();
	const singleFile = ['single-track.opus'];
	const singleSize = 512;

	const mockDir = createMockDir(singleFile.map((name) => ({ name })));
	(mockedOpendir as MockedFunction<typeof opendir>).mockResolvedValue(mockDir);
	mockedStat.mockResolvedValue(createMockStats(singleSize));

	await opusCacheCommandHandler(interaction);

	expect(interaction.editReply).toHaveBeenCalledWith(
		expect.stringContaining(
			`Currently storing ${singleFile.length} cached [Opus](<https://opus-codec.org/>) file (total: ${singleSize} B).`,
		),
	);
});

it('should handle empty cache directory', async () => {
	const interaction = createMockInteraction();

	const mockDir = createMockDir([]);
	(mockedOpendir as MockedFunction<typeof opendir>).mockResolvedValue(mockDir);

	await opusCacheCommandHandler(interaction);

	expect(interaction.editReply).toHaveBeenCalledWith(
		'Currently storing 0 cached [Opus](<https://opus-codec.org/>) files (total: 0 B).',
	);
});

it('should handle opendir error and reply with error message', async () => {
	const interaction = createMockInteraction();
	const error = new Error('Permission denied');

	mockedOpendir.mockRejectedValue(error);

	await opusCacheCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith('Scanning cache directory…');

	expect(mockedLogger.error).toHaveBeenCalledWith(
		error,
		'Failed to scan opus cache directory',
	);
	expect(mockedCaptureException).toHaveBeenCalledWith(error);

	expect(interaction.editReply).toHaveBeenCalledWith(
		'❌ Something went wrong when trying to read the cache directory.',
	);
});

it('should handle stat error and continue processing', async () => {
	const interaction = createMockInteraction();
	const error = new Error('File not found');

	const mockDir = createMockDir(EXAMPLE_FILE_NAMES.map((name) => ({ name })));
	(mockedOpendir as MockedFunction<typeof opendir>).mockResolvedValue(mockDir);
	mockedStat.mockRejectedValue(error);

	await opusCacheCommandHandler(interaction);

	expect(mockedLogger.error).toHaveBeenCalledWith(
		'Error processing batch of 3 files:',
		error,
	);

	expect(interaction.editReply).toHaveBeenCalled();
});

it('should skip non-file entries', async () => {
	const interaction = createMockInteraction();

	const mockDir = createMockDir([
		{ name: 'track1.opus', isFile: true },
		{ name: 'subdirectory', isFile: false },
		{ name: 'track2.opus', isFile: true },
	]);
	(mockedOpendir as MockedFunction<typeof opendir>).mockResolvedValue(mockDir);

	mockedStat
		.mockResolvedValueOnce(createMockStats(1024))
		.mockResolvedValueOnce(createMockStats(2048));

	await opusCacheCommandHandler(interaction);

	expect(mockedStat).toHaveBeenCalledTimes(2); // Only files, not directories
	expect(interaction.editReply).toHaveBeenCalledWith(
		expect.stringContaining('Currently storing 2 cached'),
	);
});

it('should handle large number of files with batching', async () => {
	const interaction = createMockInteraction();

	// Create 150 files to trigger batching (BATCH_SIZE = 100)
	const manyFiles = Array.from({ length: 150 }, (_, i) => ({
		name: `track${i}.opus`,
		isFile: true,
	}));

	const mockDir = createMockDir(manyFiles);
	(mockedOpendir as MockedFunction<typeof opendir>).mockResolvedValue(mockDir);

	// Mock stat to return 1024 bytes for each file
	for (let i = 0; i < 150; i++) {
		mockedStat.mockResolvedValueOnce(createMockStats(1024));
	}

	await opusCacheCommandHandler(interaction);

	expect(mockedStat).toHaveBeenCalledTimes(150);
	expect(interaction.editReply).toHaveBeenCalledWith(
		expect.stringContaining('Currently storing 150 cached'),
	);

	// Should have been called at least twice due to batching progress updates
	expect(interaction.editReply).toHaveBeenCalledWith(
		expect.stringMatching(/Analyzing cache….*files processed/),
	);
});
