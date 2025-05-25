import { unlink } from 'node:fs/promises';
import { captureException } from '@sentry/node';
import { beforeEach, expect, it, vi } from 'vitest';
import deleteOpusCacheEntry from '../deleteOpusCacheEntry';
import logger from '../logger';

const EXAMPLE_URL = 'https://example.com/track.mp3';
const EXAMPLE_FILE_PATH = '/mock/cache/directory/encoded-filename.opus';

const mockedUnlink = vi.mocked(unlink);
const mockedCaptureException = vi.mocked(captureException);
const mockedLogger = vi.mocked(logger);

vi.mock('node:fs/promises', () => ({
	unlink: vi.fn(),
}));

vi.mock('@sentry/node', () => ({
	captureException: vi.fn(),
}));

vi.mock('../getOpusCacheTrackPath', () => ({
	default: vi.fn(() => EXAMPLE_FILE_PATH),
}));

beforeEach(() => {
	vi.clearAllMocks();
});

it('should return early when url is undefined', async () => {
	await deleteOpusCacheEntry(undefined);

	expect(mockedUnlink).not.toHaveBeenCalled();
	expect(mockedLogger.warn).not.toHaveBeenCalled();
	expect(mockedLogger.error).not.toHaveBeenCalled();
	expect(mockedCaptureException).not.toHaveBeenCalled();
});

it('should return early when url is empty string', async () => {
	await deleteOpusCacheEntry('');

	expect(mockedUnlink).not.toHaveBeenCalled();
	expect(mockedLogger.warn).not.toHaveBeenCalled();
	expect(mockedLogger.error).not.toHaveBeenCalled();
	expect(mockedCaptureException).not.toHaveBeenCalled();
});

it('should successfully delete opus cache entry', async () => {
	mockedUnlink.mockResolvedValue(undefined);

	await deleteOpusCacheEntry(EXAMPLE_URL);

	expect(mockedUnlink).toHaveBeenCalledWith(EXAMPLE_FILE_PATH);
	expect(mockedLogger.warn).not.toHaveBeenCalled();
	expect(mockedLogger.error).not.toHaveBeenCalled();
	expect(mockedCaptureException).not.toHaveBeenCalled();
});

it('should log warning and return when file does not exist (ENOENT)', async () => {
	const enoentError = new Error('ENOENT: no such file or directory');
	mockedUnlink.mockRejectedValue(enoentError);

	await deleteOpusCacheEntry(EXAMPLE_URL);

	expect(mockedUnlink).toHaveBeenCalledWith(EXAMPLE_FILE_PATH);
	expect(mockedLogger.warn).toHaveBeenCalledWith(
		"Cannot delete an Opus cache entry since it doesn't exist",
	);
	expect(mockedLogger.error).not.toHaveBeenCalled();
	expect(mockedCaptureException).not.toHaveBeenCalled();
});

it('should handle ENOENT error in error message substring', async () => {
	const enoentError = new Error('Something went wrong: ENOENT error occurred');
	mockedUnlink.mockRejectedValue(enoentError);

	await deleteOpusCacheEntry(EXAMPLE_URL);

	expect(mockedUnlink).toHaveBeenCalledWith(EXAMPLE_FILE_PATH);
	expect(mockedLogger.warn).toHaveBeenCalledWith(
		"Cannot delete an Opus cache entry since it doesn't exist",
	);
	expect(mockedLogger.error).not.toHaveBeenCalled();
	expect(mockedCaptureException).not.toHaveBeenCalled();
});

it('should log error and capture exception for other filesystem errors', async () => {
	const permissionError = new Error('EACCES: permission denied');
	mockedUnlink.mockRejectedValue(permissionError);

	await deleteOpusCacheEntry(EXAMPLE_URL);

	expect(mockedUnlink).toHaveBeenCalledWith(EXAMPLE_FILE_PATH);
	expect(mockedLogger.warn).not.toHaveBeenCalled();
	expect(mockedLogger.error).toHaveBeenCalledWith(permissionError);
	expect(mockedCaptureException).toHaveBeenCalledWith(permissionError);
});

it('should handle non-Error exceptions', async () => {
	const stringError = 'Something went wrong';
	mockedUnlink.mockRejectedValue(stringError);

	await deleteOpusCacheEntry(EXAMPLE_URL);

	expect(mockedUnlink).toHaveBeenCalledWith(EXAMPLE_FILE_PATH);
	expect(mockedLogger.warn).not.toHaveBeenCalled();
	expect(mockedLogger.error).toHaveBeenCalledWith(stringError);
	expect(mockedCaptureException).toHaveBeenCalledWith(stringError);
});
