import type { Collection, Message, TextBasedChannel } from 'discord.js';
import { StringSelectMenuOptionBuilder } from 'discord.js';
import { beforeEach, expect, it, vi } from 'vitest';
import getPlaylists from '../getPlaylists';

const EXAMPLE_SPOTIFY_PLAYLIST = 'https://open.spotify.com/playlist/123';
const EXAMPLE_SONG_URL = 'https://example.com/song1';

const mockedCleanUpPlaylistContent = vi.hoisted(() => vi.fn());
const mockedIsUrlSpotifyPlaylist = vi.hoisted(() => vi.fn());
const mockedRedis = vi.hoisted(() => ({
	get: vi.fn(),
}));

const mockedExternalPlaylistCache = vi.hoisted(() => ({
	getTrackCount: vi.fn(),
	setTrackCount: vi.fn(),
	formatCacheDate: vi.fn(),
}));

vi.mock('../cleanUpPlaylistContent', () => ({
	default: mockedCleanUpPlaylistContent,
}));

vi.mock('../isUrlSpotifyPlaylist', () => ({
	default: mockedIsUrlSpotifyPlaylist,
}));

vi.mock('../redis', () => ({
	default: mockedRedis,
}));

vi.mock('../ExternalPlaylistCache', () => ({
	ExternalPlaylistCache: vi.fn(() => mockedExternalPlaylistCache),
}));

function createMockMessage(content: string): Message {
	return { content } as Message;
}

function createMockChannel(messages: Message[]): TextBasedChannel {
	const messagesCollection = {
		map: vi.fn((fn) => messages.map(fn)),
	} as unknown as Collection<string, Message>;

	return {
		messages: {
			fetch: vi.fn().mockResolvedValue(messagesCollection),
		},
	} as unknown as TextBasedChannel;
}

beforeEach(() => {
	vi.clearAllMocks();
	mockedRedis.get.mockResolvedValue(null);
	mockedExternalPlaylistCache.getTrackCount.mockResolvedValue(null);
	mockedExternalPlaylistCache.formatCacheDate.mockReturnValue('Jun 1, 2025');
});

it('should return empty array when no messages have id attribute', async () => {
	const messages = [
		createMockMessage('No id here'),
		createMockMessage('Also no id'),
	];
	const channel = createMockChannel(messages);

	const result = await getPlaylists(channel);

	expect(result.options).toEqual([]);
});

it('should extract playlists with id and triple backticks content', async () => {
	const messages = [
		createMockMessage('id="playlist1"\n```\nSong 1\nSong 2\n```'),
		createMockMessage('id="playlist2"\n```\nSong 3\n```'),
		createMockMessage('No id here'),
	];
	const channel = createMockChannel(messages);

	mockedCleanUpPlaylistContent
		.mockReturnValueOnce('Song 1\nSong 2')
		.mockReturnValueOnce('Song 3');

	mockedIsUrlSpotifyPlaylist.mockReturnValue(false);

	const result = await getPlaylists(channel);

	expect(result.options).toHaveLength(2);
	expect(result.options[0]).toBeInstanceOf(StringSelectMenuOptionBuilder);
	expect(result.options[0].data.label).toBe('playlist1');
	expect(result.options[0].data.description).toBe('2 songs');
	expect(result.options[0].data.value).toBe('playlist1');
	expect(result.options[1].data.label).toBe('playlist2');
	expect(result.options[1].data.description).toBe('1 song');
	expect(result.options[1].data.value).toBe('playlist2');
});

it('should handle playlists with Spotify URLs in triple backticks', async () => {
	const messages = [
		createMockMessage(
			`id="playlist1"\n\`\`\`\n${EXAMPLE_SPOTIFY_PLAYLIST}\n${EXAMPLE_SONG_URL}\n\`\`\``,
		),
	];
	const channel = createMockChannel(messages);

	mockedCleanUpPlaylistContent.mockReturnValue(
		`${EXAMPLE_SPOTIFY_PLAYLIST}\n${EXAMPLE_SONG_URL}`,
	);
	mockedIsUrlSpotifyPlaylist
		.mockReturnValueOnce(true) // For EXAMPLE_SPOTIFY_PLAYLIST
		.mockReturnValueOnce(false); // For EXAMPLE_SONG_URL

	const result = await getPlaylists(channel);

	expect(result.options).toHaveLength(1);
	expect(result.options[0].data.description).toBe(
		'1 song (+ 1 unresolved external playlist)',
	);
});

it('should handle playlists with only Spotify URLs in triple backticks', async () => {
	const messages = [
		createMockMessage(
			`id="playlist1"\n\`\`\`\n${EXAMPLE_SPOTIFY_PLAYLIST}\nhttps://open.spotify.com/playlist/456\n\`\`\``,
		),
	];
	const channel = createMockChannel(messages);

	mockedCleanUpPlaylistContent.mockReturnValue(
		`${EXAMPLE_SPOTIFY_PLAYLIST}\nhttps://open.spotify.com/playlist/456`,
	);
	mockedIsUrlSpotifyPlaylist.mockReturnValue(true);

	const result = await getPlaylists(channel);

	expect(result.options).toHaveLength(1);
	expect(result.options[0].data.description).toBe(
		'2 unresolved external playlists',
	);
});

it('should handle single Spotify playlist without additional songs', async () => {
	const messages = [
		createMockMessage(
			`id="playlist1"\n\`\`\`\n${EXAMPLE_SPOTIFY_PLAYLIST}\n\`\`\``,
		),
	];
	const channel = createMockChannel(messages);

	mockedCleanUpPlaylistContent.mockReturnValue(EXAMPLE_SPOTIFY_PLAYLIST);
	mockedIsUrlSpotifyPlaylist.mockReturnValue(true);

	const result = await getPlaylists(channel);

	expect(result.options).toHaveLength(1);
	expect(result.options[0].data.description).toBe(
		'1 unresolved external playlist',
	);
});

it('should limit results to 25 items', async () => {
	const messages = Array.from({ length: 30 }, (_, i) =>
		createMockMessage(`id="playlist${i}"\n\`\`\`\nSong ${i}\n\`\`\``),
	);
	const channel = createMockChannel(messages);

	mockedCleanUpPlaylistContent.mockImplementation(() => 'Song');
	mockedIsUrlSpotifyPlaylist.mockReturnValue(false);

	const result = await getPlaylists(channel);

	expect(result.options).toHaveLength(25);
});

it('should sort playlists by id alphabetically', async () => {
	const messages = [
		createMockMessage('id="zebra"\n```\nSong Z\n```'),
		createMockMessage('id="alpha"\n```\nSong A\n```'),
		createMockMessage('id="beta"\n```\nSong B\n```'),
	];
	const channel = createMockChannel(messages);

	mockedCleanUpPlaylistContent
		.mockReturnValueOnce('Song Z')
		.mockReturnValueOnce('Song A')
		.mockReturnValueOnce('Song B');

	mockedIsUrlSpotifyPlaylist.mockReturnValue(false);

	const result = await getPlaylists(channel);

	expect(result.options).toHaveLength(3);
	expect(result.options[0].data.label).toBe('alpha');
	expect(result.options[1].data.label).toBe('beta');
	expect(result.options[2].data.label).toBe('zebra');
});

it('should fetch messages with correct parameters', async () => {
	const channel = createMockChannel([]);

	await getPlaylists(channel);

	expect(channel.messages.fetch).toHaveBeenCalledWith({
		limit: 100,
		cache: false,
	});
});

it('should handle playlist without triple backticks as having 0 songs', async () => {
	const messages = [createMockMessage('id="empty" Song 1\nSong 2')];
	const channel = createMockChannel(messages);

	// cleanUpPlaylistContent returns empty string for content without triple backticks
	mockedCleanUpPlaylistContent.mockReturnValue('');
	mockedIsUrlSpotifyPlaylist.mockReturnValue(false);

	const result = await getPlaylists(channel);

	expect(result.options).toHaveLength(1);
	expect(result.options[0].data.description).toBe('0 songs');
});

it('should handle playlist with empty triple backticks as having 0 songs', async () => {
	const messages = [createMockMessage('id="empty"\n```\n```')];
	const channel = createMockChannel(messages);

	// cleanUpPlaylistContent returns empty string for empty triple backticks
	mockedCleanUpPlaylistContent.mockReturnValue('');
	mockedIsUrlSpotifyPlaylist.mockReturnValue(false);

	const result = await getPlaylists(channel);

	expect(result.options).toHaveLength(1);
	expect(result.options[0].data.description).toBe('0 songs');
});

it('should handle message content with triple backticks correctly', async () => {
	const messages = [
		createMockMessage(
			'id="playlist1"\n```\nSong with content\nAnother song\n```\nignored content',
		),
	];
	const channel = createMockChannel(messages);

	mockedCleanUpPlaylistContent.mockReturnValue(
		'Song with content\nAnother song',
	);
	mockedIsUrlSpotifyPlaylist.mockReturnValue(false);

	const result = await getPlaylists(channel);

	expect(result.options).toHaveLength(1);
	expect(result.options[0].data.description).toBe('2 songs');
	expect(mockedCleanUpPlaylistContent).toHaveBeenCalledWith(
		'id="playlist1"\n```\nSong with content\nAnother song\n```\nignored content',
	);
});

it('should ignore playlists without proper format but still process ones with id', async () => {
	const messages = [
		createMockMessage('id="valid"\n```\nSong 1\n```'),
		createMockMessage('id="invalid" Song without backticks'),
		createMockMessage('No id here\n```\nSong 2\n```'),
	];
	const channel = createMockChannel(messages);

	mockedCleanUpPlaylistContent
		.mockReturnValueOnce('Song 1') // For valid playlist
		.mockReturnValueOnce(''); // For invalid playlist (no backticks)

	mockedIsUrlSpotifyPlaylist.mockReturnValue(false);

	const result = await getPlaylists(channel);

	expect(result.options).toHaveLength(2);
	expect(result.options[0].data.label).toBe('invalid');
	expect(result.options[0].data.description).toBe('0 songs');
	expect(result.options[1].data.label).toBe('valid');
	expect(result.options[1].data.description).toBe('1 song');
});

it('should handle playlist where id appears after triple backticks', async () => {
	const messages = [
		createMockMessage('\n```\nSong 1\nSong 2\n```\nid="playlist1"'),
	];
	const channel = createMockChannel(messages);

	mockedCleanUpPlaylistContent.mockReturnValue('Song 1\nSong 2');
	mockedIsUrlSpotifyPlaylist.mockReturnValue(false);

	const result = await getPlaylists(channel);

	expect(result.options).toHaveLength(1);
	expect(result.options[0].data.label).toBe('playlist1');
	expect(result.options[0].data.description).toBe('2 songs');
	expect(result.options[0].data.value).toBe('playlist1');
});

it('should show actual song count with timestamp when Spotify playlist is cached', async () => {
	const messages = [
		createMockMessage(
			`id="playlist1"\n\`\`\`\n${EXAMPLE_SPOTIFY_PLAYLIST}\n${EXAMPLE_SONG_URL}\n\`\`\``,
		),
	];
	const channel = createMockChannel(messages);

	mockedCleanUpPlaylistContent.mockReturnValue(
		`${EXAMPLE_SPOTIFY_PLAYLIST}\n${EXAMPLE_SONG_URL}`,
	);
	mockedIsUrlSpotifyPlaylist
		.mockReturnValueOnce(true)
		.mockReturnValueOnce(false);

	mockedExternalPlaylistCache.getTrackCount.mockResolvedValue({
		trackCount: 5,
		cachedAt: '2025-06-01T12:00:00.000Z',
	});

	const result = await getPlaylists(channel);

	expect(result.options).toHaveLength(1);
	expect(result.options[0].data.description).toBe(
		'6 songs (as of Jun 1, 2025)',
	);
	expect(mockedExternalPlaylistCache.getTrackCount).toHaveBeenCalledWith(
		EXAMPLE_SPOTIFY_PLAYLIST,
	);
});

it('should show cached song count with timestamp for multiple Spotify playlists', async () => {
	const secondSpotifyPlaylist = 'https://open.spotify.com/playlist/456';
	const messages = [
		createMockMessage(
			`id="playlist1"\n\`\`\`\n${EXAMPLE_SPOTIFY_PLAYLIST}\n${secondSpotifyPlaylist}\n\`\`\``,
		),
	];
	const channel = createMockChannel(messages);

	mockedCleanUpPlaylistContent.mockReturnValue(
		`${EXAMPLE_SPOTIFY_PLAYLIST}\n${secondSpotifyPlaylist}`,
	);
	mockedIsUrlSpotifyPlaylist.mockReturnValue(true);

	mockedExternalPlaylistCache.getTrackCount
		.mockResolvedValueOnce({
			trackCount: 3,
			cachedAt: '2025-06-01T12:00:00.000Z',
		})
		.mockResolvedValueOnce({
			trackCount: 7,
			cachedAt: '2025-05-15T10:00:00.000Z',
		});

	mockedExternalPlaylistCache.formatCacheDate.mockReturnValue('May 15, 2025');

	const result = await getPlaylists(channel);

	expect(result.options).toHaveLength(1);
	expect(result.options[0].data.description).toBe(
		'10 songs (as of May 15, 2025)',
	);
});

it('should handle mix of cached and uncached Spotify playlists with timestamp', async () => {
	const secondSpotifyPlaylist = 'https://open.spotify.com/playlist/456';
	const messages = [
		createMockMessage(
			`id="playlist1"\n\`\`\`\n${EXAMPLE_SPOTIFY_PLAYLIST}\n${secondSpotifyPlaylist}\n\`\`\``,
		),
	];
	const channel = createMockChannel(messages);

	mockedCleanUpPlaylistContent.mockReturnValue(
		`${EXAMPLE_SPOTIFY_PLAYLIST}\n${secondSpotifyPlaylist}`,
	);
	mockedIsUrlSpotifyPlaylist.mockReturnValue(true);

	mockedExternalPlaylistCache.getTrackCount
		.mockResolvedValueOnce({
			trackCount: 4,
			cachedAt: '2025-06-01T12:00:00.000Z',
		})
		.mockResolvedValueOnce(null);

	const result = await getPlaylists(channel);

	expect(result.options).toHaveLength(1);
	expect(result.options[0].data.description).toBe(
		'4 songs (as of Jun 1, 2025) (+ 1 unresolved external playlist)',
	);
});

it('should fall back to playlist count when no cache data available', async () => {
	const messages = [
		createMockMessage(
			`id="playlist1"\n\`\`\`\n${EXAMPLE_SPOTIFY_PLAYLIST}\n${EXAMPLE_SONG_URL}\n\`\`\``,
		),
	];
	const channel = createMockChannel(messages);

	mockedCleanUpPlaylistContent.mockReturnValue(
		`${EXAMPLE_SPOTIFY_PLAYLIST}\n${EXAMPLE_SONG_URL}`,
	);
	mockedIsUrlSpotifyPlaylist
		.mockReturnValueOnce(true)
		.mockReturnValueOnce(false);

	mockedExternalPlaylistCache.getTrackCount.mockResolvedValue(null);

	const result = await getPlaylists(channel);

	expect(result.options).toHaveLength(1);
	expect(result.options[0].data.description).toBe(
		'1 song (+ 1 unresolved external playlist)',
	);
});

it('should handle Redis errors gracefully', async () => {
	const messages = [
		createMockMessage(
			`id="playlist1"\n\`\`\`\n${EXAMPLE_SPOTIFY_PLAYLIST}\n\`\`\``,
		),
	];
	const channel = createMockChannel(messages);

	mockedCleanUpPlaylistContent.mockReturnValue(EXAMPLE_SPOTIFY_PLAYLIST);
	mockedIsUrlSpotifyPlaylist.mockReturnValue(true);

	mockedRedis.get.mockRejectedValue(new Error('Redis connection failed'));

	const result = await getPlaylists(channel);

	expect(result.options).toHaveLength(1);
	expect(result.options[0].data.description).toBe(
		'1 unresolved external playlist',
	);
});

it('should handle invalid JSON in cache gracefully', async () => {
	const messages = [
		createMockMessage(
			`id="playlist1"\n\`\`\`\n${EXAMPLE_SPOTIFY_PLAYLIST}\n\`\`\``,
		),
	];
	const channel = createMockChannel(messages);

	mockedCleanUpPlaylistContent.mockReturnValue(EXAMPLE_SPOTIFY_PLAYLIST);
	mockedIsUrlSpotifyPlaylist.mockReturnValue(true);

	mockedRedis.get.mockResolvedValue('invalid json');

	const result = await getPlaylists(channel);

	expect(result.options).toHaveLength(1);
	expect(result.options[0].data.description).toBe(
		'1 unresolved external playlist',
	);
});
