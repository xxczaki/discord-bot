import { readdir } from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const MOCK_CACHE_DIRECTORY = '/mock/cache/directory';

vi.mock('node:fs/promises', () => ({
	readdir: vi.fn(),
}));

vi.mock('../getOpusCacheDirectoryPath', () => ({
	default: vi.fn(() => MOCK_CACHE_DIRECTORY),
}));

const mockedReaddir = vi.mocked(readdir);

describe('OpusCacheIndex', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	it('should initialize and scan directory for opus files', async () => {
		mockedReaddir.mockResolvedValue([
			'never_gonna_give_you_up_rick_astley_213.opus',
			'bohemian_rhapsody_queen_354.opus',
			'not_an_opus.mp3',
		] as unknown as Awaited<ReturnType<typeof readdir>>);

		const { default: opusCacheIndex } = await import('../OpusCacheIndex');

		await opusCacheIndex.initialize();

		expect(mockedReaddir).toHaveBeenCalledWith(MOCK_CACHE_DIRECTORY);
		expect(opusCacheIndex.entryCount).toBe(2);
	});

	it('should find exact match by title and author', async () => {
		mockedReaddir.mockResolvedValue([
			'never_gonna_give_you_up_rick_astley_213.opus',
		] as unknown as Awaited<ReturnType<typeof readdir>>);

		const { default: opusCacheIndex } = await import('../OpusCacheIndex');

		await opusCacheIndex.initialize();

		const match = opusCacheIndex.findMatch(
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

		const { default: opusCacheIndex } = await import('../OpusCacheIndex');

		await opusCacheIndex.initialize();

		const match = opusCacheIndex.findMatch('song title artist', '', 203);

		expect(match).not.toBeNull();
		expect(match?.filename).toBe('song_title_artist_200.opus');
	});

	it('should not find match when duration exceeds tolerance', async () => {
		mockedReaddir.mockResolvedValue([
			'song_title_artist_200.opus',
		] as unknown as Awaited<ReturnType<typeof readdir>>);

		const { default: opusCacheIndex } = await import('../OpusCacheIndex');

		await opusCacheIndex.initialize();

		const match = opusCacheIndex.findMatch('song title artist', '', 210);

		expect(match).toBeNull();
	});

	it('should return null when index is empty', async () => {
		mockedReaddir.mockResolvedValue(
			[] as unknown as Awaited<ReturnType<typeof readdir>>,
		);

		const { default: opusCacheIndex } = await import('../OpusCacheIndex');

		await opusCacheIndex.initialize();

		const match = opusCacheIndex.findMatch('any song', 'any artist', 180);

		expect(match).toBeNull();
	});

	it('should add entry to index', async () => {
		mockedReaddir.mockResolvedValue(
			[] as unknown as Awaited<ReturnType<typeof readdir>>,
		);

		const { default: opusCacheIndex } = await import('../OpusCacheIndex');

		await opusCacheIndex.initialize();

		opusCacheIndex.addEntry({
			filename: 'new_song_artist_180.opus',
			title: 'new song artist',
			author: '',
			durationSeconds: 180,
		});

		expect(opusCacheIndex.entryCount).toBe(1);

		const match = opusCacheIndex.findMatch('new song', 'artist', 180);
		expect(match?.filename).toBe('new_song_artist_180.opus');
	});

	it('should remove entry from index', async () => {
		mockedReaddir.mockResolvedValue([
			'song_artist_180.opus',
		] as unknown as Awaited<ReturnType<typeof readdir>>);

		const { default: opusCacheIndex } = await import('../OpusCacheIndex');

		await opusCacheIndex.initialize();

		expect(opusCacheIndex.entryCount).toBe(1);

		opusCacheIndex.removeEntry('song_artist_180.opus');

		expect(opusCacheIndex.entryCount).toBe(0);
	});

	it('should update existing entry when adding duplicate filename', async () => {
		mockedReaddir.mockResolvedValue(
			[] as unknown as Awaited<ReturnType<typeof readdir>>,
		);

		const { default: opusCacheIndex } = await import('../OpusCacheIndex');

		await opusCacheIndex.initialize();

		opusCacheIndex.addEntry({
			filename: 'song_artist_180.opus',
			title: 'song artist',
			author: '',
			durationSeconds: 180,
		});

		opusCacheIndex.addEntry({
			filename: 'song_artist_180.opus',
			title: 'updated song artist',
			author: '',
			durationSeconds: 180,
		});

		expect(opusCacheIndex.entryCount).toBe(1);
	});

	it('should get correct file path', async () => {
		mockedReaddir.mockResolvedValue(
			[] as unknown as Awaited<ReturnType<typeof readdir>>,
		);

		const { default: opusCacheIndex } = await import('../OpusCacheIndex');

		await opusCacheIndex.initialize();

		const filePath = opusCacheIndex.getFilePath('song_artist_180.opus');

		expect(filePath).toBe(`${MOCK_CACHE_DIRECTORY}/song_artist_180.opus`);
	});

	it('should handle live streams (null duration) matching zero duration', async () => {
		mockedReaddir.mockResolvedValue([
			'live_stream_streamer.opus',
		] as unknown as Awaited<ReturnType<typeof readdir>>);

		const { default: opusCacheIndex } = await import('../OpusCacheIndex');

		await opusCacheIndex.initialize();

		const match = opusCacheIndex.findMatch('live stream', 'streamer', 0);

		expect(match).not.toBeNull();
		expect(match?.filename).toBe('live_stream_streamer.opus');
	});

	it('should not match live streams with non-zero duration', async () => {
		mockedReaddir.mockResolvedValue([
			'live_stream_streamer.opus',
		] as unknown as Awaited<ReturnType<typeof readdir>>);

		const { default: opusCacheIndex } = await import('../OpusCacheIndex');

		await opusCacheIndex.initialize();

		const match = opusCacheIndex.findMatch('live stream', 'streamer', 180);

		expect(match).toBeNull();
	});
});
