import type { Collection, Message, TextBasedChannel } from 'discord.js';
import { StringSelectMenuOptionBuilder } from 'discord.js';
import { expect, it, vi } from 'vitest';
import getPlaylists from '../getPlaylists';

const EXAMPLE_SPOTIFY_PLAYLIST = 'https://open.spotify.com/playlist/123';
const EXAMPLE_SONG_URL = 'https://example.com/song1';

const mockedCleanUpPlaylistContent = vi.hoisted(() => vi.fn());
const mockedIsUrlSpotifyPlaylist = vi.hoisted(() => vi.fn());

vi.mock('../cleanUpPlaylistContent', () => ({
	default: mockedCleanUpPlaylistContent,
}));

vi.mock('../isUrlSpotifyPlaylist', () => ({
	default: mockedIsUrlSpotifyPlaylist,
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

it('should return empty array when no messages have id attribute', async () => {
	const messages = [
		createMockMessage('No id here'),
		createMockMessage('Also no id'),
	];
	const channel = createMockChannel(messages);

	const result = await getPlaylists(channel);

	expect(result).toEqual([]);
});

it('should extract playlists with id and create select menu options', async () => {
	const messages = [
		createMockMessage('id="playlist1" Song 1\nSong 2'),
		createMockMessage('id="playlist2" Song 3'),
		createMockMessage('No id here'),
	];
	const channel = createMockChannel(messages);

	mockedCleanUpPlaylistContent
		.mockReturnValueOnce('Song 1\nSong 2')
		.mockReturnValueOnce('Song 3');

	mockedIsUrlSpotifyPlaylist.mockReturnValue(false);

	const result = await getPlaylists(channel);

	expect(result).toHaveLength(2);
	expect(result[0]).toBeInstanceOf(StringSelectMenuOptionBuilder);
	expect(result[0].data.label).toBe('playlist1');
	expect(result[0].data.description).toBe('2 songs');
	expect(result[0].data.value).toBe('playlist1');
	expect(result[1].data.label).toBe('playlist2');
	expect(result[1].data.description).toBe('1 song');
	expect(result[1].data.value).toBe('playlist2');
});

it('should handle playlists with Spotify URLs', async () => {
	const messages = [
		createMockMessage(
			`id="playlist1" ${EXAMPLE_SPOTIFY_PLAYLIST}\n${EXAMPLE_SONG_URL}`,
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

	expect(result).toHaveLength(1);
	expect(result[0].data.description).toBe('1 Spotify playlist (+ 1 song)');
});

it('should handle playlists with only Spotify URLs', async () => {
	const messages = [
		createMockMessage(
			`id="playlist1" ${EXAMPLE_SPOTIFY_PLAYLIST}\nhttps://open.spotify.com/playlist/456`,
		),
	];
	const channel = createMockChannel(messages);

	mockedCleanUpPlaylistContent.mockReturnValue(
		`${EXAMPLE_SPOTIFY_PLAYLIST}\nhttps://open.spotify.com/playlist/456`,
	);
	mockedIsUrlSpotifyPlaylist.mockReturnValue(true);

	const result = await getPlaylists(channel);

	expect(result).toHaveLength(1);
	expect(result[0].data.description).toBe('2 Spotify playlists');
});

it('should handle single Spotify playlist without additional songs', async () => {
	const messages = [
		createMockMessage(`id="playlist1" ${EXAMPLE_SPOTIFY_PLAYLIST}`),
	];
	const channel = createMockChannel(messages);

	mockedCleanUpPlaylistContent.mockReturnValue(EXAMPLE_SPOTIFY_PLAYLIST);
	mockedIsUrlSpotifyPlaylist.mockReturnValue(true);

	const result = await getPlaylists(channel);

	expect(result).toHaveLength(1);
	expect(result[0].data.description).toBe('1 Spotify playlist');
});

it('should limit results to 25 items', async () => {
	const messages = Array.from({ length: 30 }, (_, i) =>
		createMockMessage(`id="playlist${i}" Song ${i}`),
	);
	const channel = createMockChannel(messages);

	mockedCleanUpPlaylistContent.mockImplementation(
		(content) => `Song ${content.match(/playlist(\d+)/)?.[1]}`,
	);
	mockedIsUrlSpotifyPlaylist.mockReturnValue(false);

	const result = await getPlaylists(channel);

	expect(result).toHaveLength(25);
});

it('should sort playlists by id alphabetically', async () => {
	const messages = [
		createMockMessage('id="zebra" Song Z'),
		createMockMessage('id="alpha" Song A'),
		createMockMessage('id="beta" Song B'),
	];
	const channel = createMockChannel(messages);

	mockedCleanUpPlaylistContent
		.mockReturnValueOnce('Song Z')
		.mockReturnValueOnce('Song A')
		.mockReturnValueOnce('Song B');

	mockedIsUrlSpotifyPlaylist.mockReturnValue(false);

	const result = await getPlaylists(channel);

	expect(result).toHaveLength(3);
	expect(result[0].data.label).toBe('alpha');
	expect(result[1].data.label).toBe('beta');
	expect(result[2].data.label).toBe('zebra');
});

it('should fetch messages with correct parameters', async () => {
	const channel = createMockChannel([]);

	await getPlaylists(channel);

	expect(channel.messages.fetch).toHaveBeenCalledWith({
		limit: 50,
		cache: false,
	});
});

it('should handle empty playlist content', async () => {
	const messages = [createMockMessage('id="empty"')];
	const channel = createMockChannel(messages);

	mockedCleanUpPlaylistContent.mockReturnValue('');
	mockedIsUrlSpotifyPlaylist.mockReturnValue(false);

	const result = await getPlaylists(channel);

	expect(result).toHaveLength(1);
	expect(result[0].data.description).toBe('1 song');
});

it('should handle message content with backticks correctly', async () => {
	const messages = [
		createMockMessage('id="playlist1" `Song with backticks`\nAnother song'),
	];
	const channel = createMockChannel(messages);

	mockedCleanUpPlaylistContent.mockReturnValue(
		'Song with backticks\nAnother song',
	);
	mockedIsUrlSpotifyPlaylist.mockReturnValue(false);

	const result = await getPlaylists(channel);

	expect(result).toHaveLength(1);
	expect(result[0].data.description).toBe('2 songs');
	expect(mockedCleanUpPlaylistContent).toHaveBeenCalledWith(
		'id="playlist1" `Song with backticks`\nAnother song',
	);
});
