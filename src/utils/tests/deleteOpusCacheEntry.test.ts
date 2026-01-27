import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { captureException } from '@sentry/node';
import { beforeEach, expect, it, vi } from 'vitest';
import deleteOpusCacheEntry from '../deleteOpusCacheEntry';
import logger from '../logger';
import opusCacheIndex from '../OpusCacheIndex';

const EXAMPLE_FILENAME = 'never_gonna_give_you_up_rick_astley_213.opus';
const MOCK_CACHE_DIRECTORY = '/mock/cache/directory';

const mockedUnlink = vi.mocked(unlink);
const mockedCaptureException = vi.mocked(captureException);
const mockedLogger = vi.mocked(logger);

vi.mock('node:fs/promises', () => ({
	unlink: vi.fn(),
}));

vi.mock('../getOpusCacheDirectoryPath', () => ({
	default: vi.fn(() => '/mock/cache/directory'),
}));

vi.mock('../OpusCacheIndex', () => ({
	default: {
		removeEntry: vi.fn(),
	},
}));

beforeEach(() => {
	vi.clearAllMocks();
});

it('should return early when filename is undefined', async () => {
	await deleteOpusCacheEntry(undefined);

	expect(mockedUnlink).not.toHaveBeenCalled();
	expect(mockedLogger.warn).not.toHaveBeenCalled();
	expect(mockedLogger.error).not.toHaveBeenCalled();
	expect(mockedCaptureException).not.toHaveBeenCalled();
});

it('should return early when filename is empty string', async () => {
	await deleteOpusCacheEntry('');

	expect(mockedUnlink).not.toHaveBeenCalled();
	expect(mockedLogger.warn).not.toHaveBeenCalled();
	expect(mockedLogger.error).not.toHaveBeenCalled();
	expect(mockedCaptureException).not.toHaveBeenCalled();
});

it('should successfully delete opus cache entry and update index', async () => {
	mockedUnlink.mockResolvedValue(undefined);

	await deleteOpusCacheEntry(EXAMPLE_FILENAME);

	expect(mockedUnlink).toHaveBeenCalledWith(
		join(MOCK_CACHE_DIRECTORY, EXAMPLE_FILENAME),
	);
	expect(opusCacheIndex.removeEntry).toHaveBeenCalledWith(EXAMPLE_FILENAME);
	expect(mockedLogger.warn).not.toHaveBeenCalled();
	expect(mockedLogger.error).not.toHaveBeenCalled();
	expect(mockedCaptureException).not.toHaveBeenCalled();
});

it('should silently return when file does not exist (ENOENT)', async () => {
	const enoentError = new Error('ENOENT: no such file or directory');
	mockedUnlink.mockRejectedValue(enoentError);

	await deleteOpusCacheEntry(EXAMPLE_FILENAME);

	expect(mockedUnlink).toHaveBeenCalledWith(
		join(MOCK_CACHE_DIRECTORY, EXAMPLE_FILENAME),
	);
	expect(mockedLogger.warn).not.toHaveBeenCalled();
	expect(opusCacheIndex.removeEntry).not.toHaveBeenCalled();
	expect(mockedLogger.error).not.toHaveBeenCalled();
	expect(mockedCaptureException).not.toHaveBeenCalled();
});

it('should handle ENOENT error in error message substring silently', async () => {
	const enoentError = new Error('Something went wrong: ENOENT error occurred');
	mockedUnlink.mockRejectedValue(enoentError);

	await deleteOpusCacheEntry(EXAMPLE_FILENAME);

	expect(mockedUnlink).toHaveBeenCalledWith(
		join(MOCK_CACHE_DIRECTORY, EXAMPLE_FILENAME),
	);
	expect(mockedLogger.warn).not.toHaveBeenCalled();
	expect(opusCacheIndex.removeEntry).not.toHaveBeenCalled();
	expect(mockedLogger.error).not.toHaveBeenCalled();
	expect(mockedCaptureException).not.toHaveBeenCalled();
});

it('should log error and capture exception for other filesystem errors', async () => {
	const permissionError = new Error('EACCES: permission denied');
	mockedUnlink.mockRejectedValue(permissionError);

	await deleteOpusCacheEntry(EXAMPLE_FILENAME);

	expect(mockedUnlink).toHaveBeenCalledWith(
		join(MOCK_CACHE_DIRECTORY, EXAMPLE_FILENAME),
	);
	expect(mockedLogger.warn).not.toHaveBeenCalled();
	expect(mockedLogger.error).toHaveBeenCalledWith(
		permissionError,
		'Failed to delete Opus cache entry',
	);
	expect(mockedCaptureException).toHaveBeenCalledWith(permissionError);
	expect(opusCacheIndex.removeEntry).not.toHaveBeenCalled();
});

it('should handle non-Error exceptions', async () => {
	const stringError = 'Something went wrong';
	mockedUnlink.mockRejectedValue(stringError);

	await deleteOpusCacheEntry(EXAMPLE_FILENAME);

	expect(mockedUnlink).toHaveBeenCalledWith(
		join(MOCK_CACHE_DIRECTORY, EXAMPLE_FILENAME),
	);
	expect(mockedLogger.warn).not.toHaveBeenCalled();
	expect(mockedLogger.error).toHaveBeenCalledWith(
		stringError,
		'Failed to delete Opus cache entry',
	);
	expect(mockedCaptureException).toHaveBeenCalledWith(stringError);
	expect(opusCacheIndex.removeEntry).not.toHaveBeenCalled();
});
