import { existsSync, mkdirSync } from 'node:fs';
import { readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { captureException } from '@sentry/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import getEnvironmentVariable from '../getEnvironmentVariable';
import logger from '../logger';
import { OpusCacheManager } from '../OpusCacheManager';

const MOCK_CACHE_DIRECTORY = '/mock/cache/directory';

vi.mock('node:fs/promises', () => ({
	readdir: vi.fn(),
	unlink: vi.fn(),
}));

vi.mock('node:fs', () => ({
	existsSync: vi.fn(),
	mkdirSync: vi.fn(),
}));

vi.mock('../getEnvironmentVariable', () => ({
	default: vi.fn().mockReturnValue('development'),
}));

const mockedReaddir = vi.mocked(readdir);
const mockedUnlink = vi.mocked(unlink);
const mockedExistsSync = vi.mocked(existsSync);
const mockedMkdirSync = vi.mocked(mkdirSync);
const mockedGetEnvironmentVariable = vi.mocked(getEnvironmentVariable);
const mockedCaptureException = vi.mocked(captureException);
const mockedLogger = vi.mocked(logger);

const mockedDirname = join(process.cwd(), 'src', 'utils');

vi.stubGlobal('import.meta', { dirname: mockedDirname });

describe('OpusCacheManager', () => {
	let opusCacheManager: OpusCacheManager;

	beforeEach(() => {
		vi.clearAllMocks();
		opusCacheManager = new OpusCacheManager(MOCK_CACHE_DIRECTORY);
	});

	describe('scan', () => {
		it('should initialize and scan directory for opus files', async () => {
			mockedReaddir.mockResolvedValue([
				'never_gonna_give_you_up_rick_astley_213.opus',
				'bohemian_rhapsody_queen_354.opus',
				'not_an_opus.mp3',
			] as unknown as Awaited<ReturnType<typeof readdir>>);

			await opusCacheManager.scan();

			expect(mockedReaddir).toHaveBeenCalledWith(MOCK_CACHE_DIRECTORY);
			expect(opusCacheManager.entryCount).toBe(2);
		});
	});

	describe('findMatch', () => {
		it('should find exact match by title and author', async () => {
			mockedReaddir.mockResolvedValue([
				'never_gonna_give_you_up_rick_astley_213.opus',
			] as unknown as Awaited<ReturnType<typeof readdir>>);

			await opusCacheManager.scan();

			const match = opusCacheManager.findMatch(
				'never gonna give you up',
				'rick astley',
				213,
			);

			expect(match).not.toBeNull();
			expect(match?.filename).toBe(
				'never_gonna_give_you_up_rick_astley_213.opus',
			);
		});

		it('should find match with duration tolerance', async () => {
			mockedReaddir.mockResolvedValue([
				'song_title_artist_200.opus',
			] as unknown as Awaited<ReturnType<typeof readdir>>);

			await opusCacheManager.scan();

			const match = opusCacheManager.findMatch('song title artist', '', 203);

			expect(match).not.toBeNull();
			expect(match?.filename).toBe('song_title_artist_200.opus');
		});

		it('should not find match when duration exceeds tolerance', async () => {
			mockedReaddir.mockResolvedValue([
				'song_title_artist_200.opus',
			] as unknown as Awaited<ReturnType<typeof readdir>>);

			await opusCacheManager.scan();

			const match = opusCacheManager.findMatch('song title artist', '', 210);

			expect(match).toBeNull();
		});

		it('should return null when index is empty', async () => {
			mockedReaddir.mockResolvedValue(
				[] as unknown as Awaited<ReturnType<typeof readdir>>,
			);

			await opusCacheManager.scan();

			const match = opusCacheManager.findMatch('any song', 'any artist', 180);

			expect(match).toBeNull();
		});

		it('should handle live streams (null duration) matching zero duration', async () => {
			mockedReaddir.mockResolvedValue([
				'live_stream_streamer.opus',
			] as unknown as Awaited<ReturnType<typeof readdir>>);

			await opusCacheManager.scan();

			const match = opusCacheManager.findMatch('live stream', 'streamer', 0);

			expect(match).not.toBeNull();
			expect(match?.filename).toBe('live_stream_streamer.opus');
		});

		it('should not match live streams with non-zero duration', async () => {
			mockedReaddir.mockResolvedValue([
				'live_stream_streamer.opus',
			] as unknown as Awaited<ReturnType<typeof readdir>>);

			await opusCacheManager.scan();

			const match = opusCacheManager.findMatch('live stream', 'streamer', 180);

			expect(match).toBeNull();
		});

		it('should match remastered variants', async () => {
			mockedReaddir.mockResolvedValue([
				'lovesong_2010_remaster_the_cure_209.opus',
			] as unknown as Awaited<ReturnType<typeof readdir>>);

			await opusCacheManager.scan();

			const match = opusCacheManager.findMatch('Lovesong', 'The Cure', 209);

			expect(match).not.toBeNull();
			expect(match?.filename).toBe('lovesong_2010_remaster_the_cure_209.opus');
		});

		it('should match single version variants', async () => {
			mockedReaddir.mockResolvedValue([
				'personal_jesus_single_version_depeche_mode_226.opus',
			] as unknown as Awaited<ReturnType<typeof readdir>>);

			await opusCacheManager.scan();

			const match = opusCacheManager.findMatch(
				'Personal Jesus',
				'Depeche Mode',
				226,
			);

			expect(match).not.toBeNull();
			expect(match?.filename).toBe(
				'personal_jesus_single_version_depeche_mode_226.opus',
			);
		});

		it('should not match different songs with shared author words', async () => {
			mockedReaddir.mockResolvedValue([
				'zrobmy_to_republika_195.opus',
			] as unknown as Awaited<ReturnType<typeof readdir>>);

			await opusCacheManager.scan();

			const match = opusCacheManager.findMatch('Hibernatus', 'Republika', 253);

			expect(match).toBeNull();
		});
	});

	describe('addEntry', () => {
		it('should add entry to index', async () => {
			mockedReaddir.mockResolvedValue(
				[] as unknown as Awaited<ReturnType<typeof readdir>>,
			);

			await opusCacheManager.scan();

			opusCacheManager.addEntry({
				filename: 'new_song_artist_180.opus',
				title: 'new song artist',
				author: '',
				durationSeconds: 180,
			});

			expect(opusCacheManager.entryCount).toBe(1);

			const match = opusCacheManager.findMatch('new song', 'artist', 180);
			expect(match?.filename).toBe('new_song_artist_180.opus');
		});

		it('should update existing entry when adding duplicate filename', async () => {
			mockedReaddir.mockResolvedValue(
				[] as unknown as Awaited<ReturnType<typeof readdir>>,
			);

			await opusCacheManager.scan();

			opusCacheManager.addEntry({
				filename: 'song_artist_180.opus',
				title: 'song artist',
				author: '',
				durationSeconds: 180,
			});

			opusCacheManager.addEntry({
				filename: 'song_artist_180.opus',
				title: 'updated song artist',
				author: '',
				durationSeconds: 180,
			});

			expect(opusCacheManager.entryCount).toBe(1);
		});
	});

	describe('removeEntry', () => {
		it('should remove entry from index', async () => {
			mockedReaddir.mockResolvedValue([
				'song_artist_180.opus',
			] as unknown as Awaited<ReturnType<typeof readdir>>);

			await opusCacheManager.scan();

			expect(opusCacheManager.entryCount).toBe(1);

			opusCacheManager.removeEntry('song_artist_180.opus');

			expect(opusCacheManager.entryCount).toBe(0);
		});
	});

	describe('getFilePath', () => {
		it('should get correct file path', async () => {
			mockedReaddir.mockResolvedValue(
				[] as unknown as Awaited<ReturnType<typeof readdir>>,
			);

			await opusCacheManager.scan();

			const filePath = opusCacheManager.getFilePath('song_artist_180.opus');

			expect(filePath).toBe(`${MOCK_CACHE_DIRECTORY}/song_artist_180.opus`);
		});
	});

	describe('directory getter', () => {
		it('should return the cache directory', () => {
			expect(opusCacheManager.directory).toBe(MOCK_CACHE_DIRECTORY);
		});
	});

	describe('deleteEntry', () => {
		it('should return early when filename is undefined', async () => {
			await opusCacheManager.deleteEntry(undefined);

			expect(mockedUnlink).not.toHaveBeenCalled();
			expect(mockedLogger.warn).not.toHaveBeenCalled();
			expect(mockedLogger.error).not.toHaveBeenCalled();
			expect(mockedCaptureException).not.toHaveBeenCalled();
		});

		it('should return early when filename is empty string', async () => {
			await opusCacheManager.deleteEntry('');

			expect(mockedUnlink).not.toHaveBeenCalled();
			expect(mockedLogger.warn).not.toHaveBeenCalled();
			expect(mockedLogger.error).not.toHaveBeenCalled();
			expect(mockedCaptureException).not.toHaveBeenCalled();
		});

		it('should successfully delete file', async () => {
			const filename = 'never_gonna_give_you_up_rick_astley_213.opus';
			mockedUnlink.mockResolvedValue(undefined);

			await opusCacheManager.deleteEntry(filename);

			expect(mockedUnlink).toHaveBeenCalledWith(
				`${MOCK_CACHE_DIRECTORY}/${filename}`,
			);
			expect(mockedLogger.warn).not.toHaveBeenCalled();
			expect(mockedLogger.error).not.toHaveBeenCalled();
			expect(mockedCaptureException).not.toHaveBeenCalled();
		});

		it('should silently return when file does not exist (ENOENT)', async () => {
			const filename = 'never_gonna_give_you_up_rick_astley_213.opus';
			const enoentError = new Error('ENOENT: no such file or directory');
			mockedUnlink.mockRejectedValue(enoentError);

			await opusCacheManager.deleteEntry(filename);

			expect(mockedUnlink).toHaveBeenCalledWith(
				`${MOCK_CACHE_DIRECTORY}/${filename}`,
			);
			expect(mockedLogger.warn).not.toHaveBeenCalled();
			expect(mockedLogger.error).not.toHaveBeenCalled();
			expect(mockedCaptureException).not.toHaveBeenCalled();
		});

		it('should log error and capture exception for other filesystem errors', async () => {
			const filename = 'never_gonna_give_you_up_rick_astley_213.opus';
			const permissionError = new Error('EACCES: permission denied');
			mockedUnlink.mockRejectedValue(permissionError);

			await opusCacheManager.deleteEntry(filename);

			expect(mockedUnlink).toHaveBeenCalledWith(
				`${MOCK_CACHE_DIRECTORY}/${filename}`,
			);
			expect(mockedLogger.warn).not.toHaveBeenCalled();
			expect(mockedLogger.error).toHaveBeenCalledWith(
				permissionError,
				'Failed to delete Opus cache entry',
			);
			expect(mockedCaptureException).toHaveBeenCalledWith(permissionError);
		});

		it('should handle non-Error exceptions', async () => {
			const filename = 'never_gonna_give_you_up_rick_astley_213.opus';
			const stringError = 'Something went wrong';
			mockedUnlink.mockRejectedValue(stringError);

			await opusCacheManager.deleteEntry(filename);

			expect(mockedUnlink).toHaveBeenCalledWith(
				`${MOCK_CACHE_DIRECTORY}/${filename}`,
			);
			expect(mockedLogger.warn).not.toHaveBeenCalled();
			expect(mockedLogger.error).toHaveBeenCalledWith(
				stringError,
				'Failed to delete Opus cache entry',
			);
			expect(mockedCaptureException).toHaveBeenCalledWith(stringError);
		});
	});

	describe('generateFilename', () => {
		it('should generate filename with title, author, and duration', () => {
			const result = opusCacheManager.generateFilename({
				title: 'Never Gonna Give You Up',
				author: 'Rick Astley',
				durationMS: 213000,
			});

			expect(result).toBe('never_gonna_give_you_up_rick_astley_213.opus');
		});

		it('should omit duration for live streams (zero duration)', () => {
			const result = opusCacheManager.generateFilename({
				title: 'Live Stream',
				author: 'Streamer',
				durationMS: 0,
			});

			expect(result).toBe('live_stream_streamer.opus');
		});

		it('should use "unknown_title" for empty title', () => {
			const result = opusCacheManager.generateFilename({
				title: '',
				author: 'Artist',
				durationMS: 180000,
			});

			expect(result).toBe('unknown_title_artist_180.opus');
		});

		it('should use "unknown_artist" for empty author', () => {
			const result = opusCacheManager.generateFilename({
				title: 'Song',
				author: '',
				durationMS: 180000,
			});

			expect(result).toBe('song_unknown_artist_180.opus');
		});

		it('should truncate long titles', () => {
			const longTitle = 'a'.repeat(150);
			const result = opusCacheManager.generateFilename({
				title: longTitle,
				author: 'Artist',
				durationMS: 180000,
			});

			expect(result.length).toBeLessThanOrEqual(100 + 50 + 10 + 6);
			expect(result).toMatch(/^a{100}_artist_180\.opus$/);
		});

		it('should truncate long author names', () => {
			const longAuthor = 'b'.repeat(100);
			const result = opusCacheManager.generateFilename({
				title: 'Song',
				author: longAuthor,
				durationMS: 180000,
			});

			expect(result).toMatch(/^song_b{50}_180\.opus$/);
		});

		it('should round duration to nearest second', () => {
			const result = opusCacheManager.generateFilename({
				title: 'Song',
				author: 'Artist',
				durationMS: 180500,
			});

			expect(result).toBe('song_artist_181.opus');
		});

		it('should handle special characters in title and author', () => {
			const result = opusCacheManager.generateFilename({
				title: 'Song: Part 1 (feat. Guest)',
				author: 'Artist & Band',
				durationMS: 200000,
			});

			expect(result).toBe('song_part_1_(feat._guest)_artist_&_band_200.opus');
		});
	});

	describe('static getDirectoryPath', () => {
		beforeEach(() => {
			vi.resetModules();
			mockedGetEnvironmentVariable.mockReturnValue('development');
		});

		it('returns /opus-cache in production environment', () => {
			mockedGetEnvironmentVariable.mockReturnValue('production');

			const result = OpusCacheManager.getDirectoryPath();

			expect(result).toBe('/opus-cache');
			expect(mockedExistsSync).not.toHaveBeenCalled();
			expect(mockedMkdirSync).not.toHaveBeenCalled();
		});
	});
});
