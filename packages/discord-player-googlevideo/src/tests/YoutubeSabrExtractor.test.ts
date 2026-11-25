import { PassThrough } from 'node:stream';
import type { Track } from 'discord-player';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { YoutubeSabrExtractor } from '../YoutubeSabrExtractor.js';

const mockInnertube = vi.hoisted(() => {
	return {
		session: {
			context: {
				client: {
					clientName: 'WEB',
					clientVersion: '2.0',
				},
			},
			player: {
				signature_timestamp: 12345,
				decipher: vi.fn(),
			},
		},
		actions: {},
		getBasicInfo: vi.fn(),
		getPlaylist: vi.fn(),
		search: vi.fn(),
	};
});

type SabrStreamConfig = {
	poToken?: string;
	serverAbrStreamingUrl: string;
	videoPlaybackUstreamerConfig: string;
	callbacks: {
		onMintPoToken: () => Promise<Uint8Array>;
		onReloadPlayerResponse: (context: unknown) => Promise<unknown>;
	};
};

const mockSabrStream = vi.hoisted(() => {
	return {
		configs: [] as unknown[],
		start: vi.fn(),
		abort: vi.fn(),
		removeAllListeners: vi.fn(),
		on: vi.fn(),
		getState: vi.fn(),
		snapshot: vi.fn(),
	};
});

const mockCreateWebPoMinter = vi.hoisted(() => vi.fn());
const mockLogger = vi.hoisted(() => ({ setLogLevels: vi.fn() }));

const mockNavigationEndpointCall = vi.hoisted(() => vi.fn());

vi.mock('youtubei.js', () => {
	class NavigationEndpoint {
		call = mockNavigationEndpointCall;
	}

	return {
		Innertube: {
			create: vi.fn().mockResolvedValue(mockInnertube),
		},
		Platform: {
			shim: {},
		},
		UniversalCache: vi.fn(),
		YTNodes: {
			NavigationEndpoint,
		},
		Constants: {
			CLIENT_NAME_IDS: {
				WEB: '1',
			},
		},
	};
});

vi.mock('googlevideo/sabr-stream', () => {
	class SabrStream {
		constructor(config: unknown) {
			mockSabrStream.configs.push(config);
		}

		start = mockSabrStream.start;
		abort = mockSabrStream.abort;
		removeAllListeners = mockSabrStream.removeAllListeners;
		on = mockSabrStream.on;
		getState = mockSabrStream.getState;
		snapshot = mockSabrStream.snapshot;
	}

	return { SabrStream };
});

vi.mock('googlevideo/utils', () => ({
	buildSabrFormat: vi.fn((format) => format),
	EnabledTrackTypes: {
		AUDIO_ONLY: 1,
	},
	Logger: {
		getInstance: () => mockLogger,
	},
	LogLevel: {
		ERROR: 1,
		WARN: 2,
		INFO: 3,
	},
}));

vi.mock('../utils/generateWebPoToken.js', () => ({
	createWebPoMinter: mockCreateWebPoMinter,
}));

function createMockMinter(token: string) {
	return {
		mint: vi.fn().mockResolvedValue(new TextEncoder().encode(token)),
		mintAsWebsafeString: vi.fn().mockResolvedValue(token),
	};
}

const mockPlayer = {
	extractors: {
		register: vi.fn(),
		loadMulti: vi.fn(),
	},
} as never;

describe('YoutubeSabrExtractor', () => {
	let extractor: YoutubeSabrExtractor;

	beforeEach(() => {
		vi.clearAllMocks();
		extractor = new YoutubeSabrExtractor({} as never, mockPlayer);

		mockSabrStream.configs = [];
		mockCreateWebPoMinter.mockResolvedValue({
			minter: createMockMinter('po-token-123'),
			expiresAt: Number.POSITIVE_INFINITY,
		});
	});

	describe('identifier', () => {
		it('should have the correct identifier', () => {
			expect(YoutubeSabrExtractor.identifier).toBe(
				'com.github.xxczaki.youtube-sabr',
			);
		});
	});

	describe('activate', () => {
		it('should initialize Innertube and set protocols', async () => {
			await extractor.activate();

			expect(extractor.protocols).toEqual(['ytsearch', 'youtube']);
		});

		it('should set up YouTube.js evaluator', async () => {
			const { Platform } = await import('youtubei.js');

			await extractor.activate();

			expect(Platform.shim.eval).toBeDefined();
		});
	});

	describe('deactivate', () => {
		it('should clear Innertube instance', async () => {
			await extractor.activate();
			await extractor.deactivate();

			// Verify extractor is deactivated by attempting to call validate after
			expect(await extractor.validate('https://youtube.com/watch?v=test')).toBe(
				true,
			);
		});
	});

	describe('validate', () => {
		it('should validate standard YouTube URLs', async () => {
			expect(
				await extractor.validate('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
			).toBe(true);
			expect(await extractor.validate('https://youtu.be/dQw4w9WgXcQ')).toBe(
				true,
			);
		});

		it('should validate YouTube URLs with query parameters', async () => {
			expect(
				await extractor.validate(
					'https://youtu.be/IU2wBKoDOzg?si=ngWivKeYJBT4WDq6',
				),
			).toBe(true);
			expect(
				await extractor.validate(
					'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s',
				),
			).toBe(true);
		});

		it('should validate YouTube protocol queries', async () => {
			expect(await extractor.validate('youtube:search query')).toBe(true);
			expect(await extractor.validate('ytsearch:search query')).toBe(true);
		});

		it('should reject non-YouTube URLs', async () => {
			expect(await extractor.validate('https://spotify.com/track/123')).toBe(
				false,
			);
			expect(await extractor.validate('https://example.com')).toBe(false);
		});

		it('should reject arbitrary query type', async () => {
			expect(
				await extractor.validate(
					'https://youtube.com/watch?v=123',
					'arbitrary',
				),
			).toBe(false);
		});
	});

	describe('handle', () => {
		beforeEach(async () => {
			await extractor.activate();
		});

		it('should throw error if not initialized', async () => {
			const uninitializedExtractor = new YoutubeSabrExtractor(
				{} as never,
				mockPlayer,
			);

			await expect(
				uninitializedExtractor.handle('test query', {
					requestedBy: { id: 'user-123' },
				} as never),
			).rejects.toThrow('YoutubeSabrExtractor not initialized');
		});

		it('should handle direct video URL', async () => {
			const mockVideoInfo = {
				basic_info: {
					title: 'Test Video',
					author: 'Test Author',
					duration: 180,
					thumbnail: [{ url: 'https://example.com/thumb.jpg' }],
					view_count: 1000,
				},
			};

			mockInnertube.getBasicInfo.mockResolvedValue(mockVideoInfo);

			const result = await extractor.handle(
				'https://youtube.com/watch?v=dQw4w9WgXcQ',
				{
					requestedBy: { id: 'user-123' },
				} as never,
			);

			expect(result.playlist).toBeNull();
			expect(result.tracks).toHaveLength(1);
			expect(result.tracks[0].title).toBe('Test Video');
			expect(result.tracks[0].author).toBe('Test Author');
		});

		it('should handle search query', async () => {
			const mockSearchResults = {
				videos: [
					{
						id: 'video-1',
						title: { text: 'Search Result 1' },
						author: { name: 'Author 1' },
						duration: { seconds: 120 },
						thumbnails: [{ url: 'https://example.com/thumb1.jpg' }],
						view_count: { text: '1,000 views' },
					},
					{
						id: 'video-2',
						title: { text: 'Search Result 2' },
						author: { name: 'Author 2' },
						duration: { seconds: 240 },
						thumbnails: [{ url: 'https://example.com/thumb2.jpg' }],
						view_count: { text: '2,000 views' },
					},
				],
				slice: vi.fn().mockReturnThis(),
			};

			mockSearchResults.slice = vi
				.fn()
				.mockReturnValue(mockSearchResults.videos);
			mockInnertube.search.mockResolvedValue(mockSearchResults);

			const result = await extractor.handle('test search query', {
				requestedBy: { id: 'user-123' },
			} as never);

			expect(mockInnertube.search).toHaveBeenCalledWith('test search query', {
				type: 'video',
			});
			expect(result.tracks).toHaveLength(2);
			expect(result.tracks[0].title).toBe('Search Result 1');
			expect(result.tracks[1].title).toBe('Search Result 2');
		});

		it('should strip youtube: prefix from query', async () => {
			mockInnertube.search.mockResolvedValue({ videos: [], slice: vi.fn() });

			await extractor.handle('youtube:test query', {
				requestedBy: { id: 'user-123' },
			} as never);

			expect(mockInnertube.search).toHaveBeenCalledWith('test query', {
				type: 'video',
			});
		});

		it('should strip ytsearch: prefix from query', async () => {
			mockInnertube.search.mockResolvedValue({ videos: [], slice: vi.fn() });

			await extractor.handle('ytsearch:test query', {
				requestedBy: { id: 'user-123' },
			} as never);

			expect(mockInnertube.search).toHaveBeenCalledWith('test query', {
				type: 'video',
			});
		});

		it('should return empty result when video has no basic_info', async () => {
			mockInnertube.getBasicInfo.mockResolvedValue({});

			const result = await extractor.handle(
				'https://youtube.com/watch?v=invalid',
				{
					requestedBy: { id: 'user-123' },
				} as never,
			);

			expect(result.tracks).toHaveLength(0);
		});

		it('should handle search errors gracefully', async () => {
			mockInnertube.search.mockRejectedValue(new Error('Search failed'));

			const result = await extractor.handle('test query', {
				requestedBy: { id: 'user-123' },
			} as never);

			expect(result.tracks).toHaveLength(0);
		});

		it('should skip videos without id in search results', async () => {
			const mockSearchResults = {
				videos: [
					{ title: { text: 'No ID Video' } },
					{
						id: 'video-2',
						title: { text: 'Valid Video' },
						author: { name: 'Author' },
						duration: { seconds: 120 },
					},
				],
				slice: vi.fn().mockReturnThis(),
			};

			mockSearchResults.slice = vi
				.fn()
				.mockReturnValue(mockSearchResults.videos);
			mockInnertube.search.mockResolvedValue(mockSearchResults);

			const result = await extractor.handle('test query', {
				requestedBy: { id: 'user-123' },
			} as never);

			expect(result.tracks).toHaveLength(1);
			expect(result.tracks[0].title).toBe('Valid Video');
		});

		it('should handle direct playlist URL', async () => {
			const mockPlaylistInfo = {
				info: {
					title: 'Playlist title',
					author: {
						url: 'https://example.com/author',
						name: 'Test author',
					},
				},
				has_continuation: false,
				videos: [
					{
						id: 'video-1',
						title: { text: 'Playlist Video 1' },
						author: { name: 'Author 1' },
						duration: { seconds: 120 },
					},
					{
						id: 'video-2',
						title: { text: 'Playlist Video 2' },
						author: { name: 'Author 2' },
						duration: { seconds: 120 },
					},
				],
			};

			mockInnertube.getPlaylist.mockResolvedValue(mockPlaylistInfo);

			const result = await extractor.handle(
				'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLE0hg-LdSfycrpTtMImPSqFLle4yYNzWD',
				{
					requestedBy: { id: 'user-123' },
				} as never,
			);

			expect(result.playlist).toBeTruthy();
			expect(mockInnertube.search).not.toHaveBeenCalled();
			expect(result.tracks).toHaveLength(2);
			expect(result.playlist?.author.url).toBe('https://example.com/author');
			expect(result.playlist?.author.name).toBe('Test author');
			expect(result.tracks[0].title).toBe('Playlist Video 1');
			expect(result.tracks[0].author).toBe('Author 1');
			expect(result.tracks[1].title).toBe('Playlist Video 2');
			expect(result.tracks[1].author).toBe('Author 2');
		});

		it('should fetch playlist until everything is fetched', async () => {
			let hasContinuation = true;
			let callCount = 0;

			const mockPlaylistInfo = {
				info: {
					title: 'Playlist title',
					author: {},
				},
				get has_continuation() {
					return hasContinuation;
				},
				videos: [
					{
						id: 'video-1',
						title: { text: 'Playlist Video 1' },
						author: { name: 'Author 1' },
						duration: { seconds: 120 },
					},
				],
				getContinuation: vi.fn().mockImplementation(() => {
					callCount++;

					if (callCount >= 3) {
						hasContinuation = false;
					}
				}),
			};

			mockInnertube.getPlaylist.mockResolvedValue(mockPlaylistInfo);

			const result = await extractor.handle(
				'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLE0hg-LdSfycrpTtMImPSqFLle4yYNzWD',
				{
					requestedBy: { id: 'user-123' },
				} as never,
			);

			expect(result.playlist).toBeTruthy();
			expect(mockInnertube.search).not.toHaveBeenCalled();
			expect(mockPlaylistInfo.getContinuation).toHaveBeenCalledTimes(3);
			expect(result.tracks).toHaveLength(1);
			expect(result.tracks[0].title).toBe('Playlist Video 1');
			expect(result.tracks[0].author).toBe('Author 1');
		});

		it('should return empty response when playlist is null', async () => {
			mockInnertube.getPlaylist.mockResolvedValue(null);

			const result = await extractor.handle(
				'https://www.youtube.com/watch?v=test&list=PLE0hg-LdSfycrpTtMImPSqFLle4yYNzWD',
				{
					requestedBy: { id: 'user-123' },
				} as never,
			);

			expect(result.tracks).toHaveLength(0);
		});

		it('should filter out playlist videos without id', async () => {
			mockInnertube.getPlaylist.mockResolvedValue({
				info: { title: 'Test Playlist', author: {} },
				has_continuation: false,
				videos: [
					{ title: { text: 'No ID' } },
					{
						id: 'v1',
						title: { text: 'Has ID' },
						author: { name: 'Author' },
						duration: { seconds: 60 },
					},
				],
			});

			const result = await extractor.handle(
				'https://www.youtube.com/watch?v=test&list=PLE0hg-LdSfycrpTtMImPSqFLle4yYNzWD',
				{
					requestedBy: { id: 'user-123' },
				} as never,
			);

			expect(result.tracks).toHaveLength(1);
			expect(result.tracks[0].title).toBe('Has ID');
		});

		it('should handle search results with missing metadata', async () => {
			const mockSearchResults = {
				videos: [{ id: 'v1' }],
				slice: vi.fn().mockReturnThis(),
			};

			mockSearchResults.slice = vi
				.fn()
				.mockReturnValue(mockSearchResults.videos);
			mockInnertube.search.mockResolvedValue(mockSearchResults);

			const result = await extractor.handle('test query', {
				requestedBy: { id: 'user-123' },
			} as never);

			expect(result.tracks).toHaveLength(1);
			expect(result.tracks[0].title).toBe('Unknown');
			expect(result.tracks[0].author).toBe('Unknown');
		});

		it('should handle playlist with missing title', async () => {
			mockInnertube.getPlaylist.mockResolvedValue({
				info: {
					author: {},
				},
				has_continuation: false,
				videos: [
					{
						id: 'v1',
						title: { text: 'Video' },
						author: { name: 'Author' },
						duration: { seconds: 60 },
					},
				],
			});

			const result = await extractor.handle(
				'https://www.youtube.com/watch?v=test&list=PLE0hg-LdSfycrpTtMImPSqFLle4yYNzWD',
				{
					requestedBy: { id: 'user-123' },
				} as never,
			);

			expect(result.playlist).toBeTruthy();
			expect(result.tracks).toHaveLength(1);
		});
	});

	describe('stream', () => {
		beforeEach(async () => {
			await extractor.activate();
		});

		it('should throw error if not initialized', async () => {
			const uninitializedExtractor = new YoutubeSabrExtractor(
				{} as never,
				mockPlayer,
			);

			await expect(
				uninitializedExtractor.stream({
					url: 'https://youtube.com/watch?v=test',
				} as Track),
			).rejects.toThrow('YoutubeSabrExtractor not initialized');
		});

		it('should throw error for invalid YouTube URL', async () => {
			await expect(
				extractor.stream({
					url: 'https://invalid.com/video',
				} as Track),
			).rejects.toThrow('Invalid YouTube URL');
		});

		it('should return a PassThrough stream', async () => {
			mockInnertube.session.player.decipher.mockResolvedValue(
				'https://deciphered.com/stream',
			);

			// Mock the NavigationEndpoint.call to return player response
			mockNavigationEndpointCall.mockResolvedValue({
				streaming_data: {
					server_abr_streaming_url: 'https://example.com/stream',
					adaptive_formats: [{ itag: 140 }],
				},
				player_config: {
					media_common_config: {
						media_ustreamer_request_config: {
							video_playback_ustreamer_config: 'config-data',
						},
					},
				},
			} as never);

			const mockReadableStream = new ReadableStream();

			mockSabrStream.start.mockReturnValue({
				audioStream: mockReadableStream,
			});

			const stream = await extractor.stream({
				url: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
			} as Track);

			expect(stream).toBeInstanceOf(PassThrough);
		});

		it('should handle PO token generation failure gracefully', async () => {
			mockCreateWebPoMinter.mockRejectedValue(
				new Error('PO token generation failed'),
			);

			mockInnertube.session.player.decipher.mockResolvedValue(
				'https://deciphered.com/stream',
			);

			// Mock the NavigationEndpoint.call to return player response
			mockNavigationEndpointCall.mockResolvedValue({
				streaming_data: {
					server_abr_streaming_url: 'https://example.com/stream',
					adaptive_formats: [{ itag: 140 }],
				},
				player_config: {
					media_common_config: {
						media_ustreamer_request_config: {
							video_playback_ustreamer_config: 'config-data',
						},
					},
				},
			} as never);

			const mockReadableStream = new ReadableStream();

			mockSabrStream.start.mockReturnValue({
				audioStream: mockReadableStream,
			});

			const stream = await extractor.stream({
				url: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
			} as Track);

			expect(stream).toBeInstanceOf(PassThrough);
		});

		it('should set `streamError` and end the output when SABR fails mid-stream', async () => {
			vi.spyOn(console, 'error').mockImplementation(() => {});

			mockInnertube.session.player.decipher.mockResolvedValue(
				'https://deciphered.com/stream',
			);
			mockNavigationEndpointCall.mockResolvedValue({
				streaming_data: {
					server_abr_streaming_url: 'https://example.com/stream',
					adaptive_formats: [{ itag: 251 }],
				},
				player_config: {
					media_common_config: {
						media_ustreamer_request_config: {
							video_playback_ustreamer_config: 'config-data',
						},
					},
				},
			} as never);

			const sabrError = new Error(
				'Streaming data reload requested but no handler was found',
			);

			mockSabrStream.start.mockReturnValue({
				audioStream: new ReadableStream({
					start(controller) {
						controller.enqueue(new Uint8Array([1, 2, 3]));
						setTimeout(() => controller.error(sabrError), 10);
					},
				}),
			});

			const setMetadata = vi.fn();
			const stream = await extractor.stream({
				url: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
				metadata: { requestedById: '123' },
				setMetadata,
			} as unknown as Track);

			stream.resume();

			await vi.waitFor(() => {
				expect(setMetadata).toHaveBeenCalledWith({
					requestedById: '123',
					streamError: sabrError,
				});
			});
			await vi.waitFor(() => {
				expect(stream.writableEnded).toBe(true);
			});
		});
	});

	describe('stream protection', () => {
		const playerResponse = {
			streaming_data: {
				server_abr_streaming_url: 'https://example.com/stream',
				adaptive_formats: [{ itag: 251 }],
			},
			player_config: {
				media_common_config: {
					media_ustreamer_request_config: {
						video_playback_ustreamer_config: 'config-data',
					},
				},
			},
		};

		let statusListener: (update: { status: number }) => void;

		async function startStream(): Promise<SabrStreamConfig> {
			const configCount = mockSabrStream.configs.length;

			await extractor.stream({
				url: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
				metadata: {},
				setMetadata: vi.fn(),
			} as unknown as Track);

			await vi.waitFor(() => {
				expect(mockSabrStream.configs).toHaveLength(configCount + 1);
			});

			return mockSabrStream.configs.at(-1) as SabrStreamConfig;
		}

		beforeEach(async () => {
			vi.spyOn(console, 'warn').mockImplementation(() => {});
			mockInnertube.session.player.decipher.mockImplementation(
				async (url: string) => `${url}?deciphered`,
			);
			mockNavigationEndpointCall.mockResolvedValue(playerResponse as never);
			mockSabrStream.on.mockImplementation(
				(event: string, listener: typeof statusListener) => {
					if (event === 'streamProtectionStatusUpdate') {
						statusListener = listener;
					}
				},
			);
			mockSabrStream.start.mockImplementation(() => ({
				audioStream: new ReadableStream(),
			}));

			await extractor.activate();
		});

		it('should reuse one BotGuard session across streams', async () => {
			const firstConfig = await startStream();
			await startStream();

			expect(firstConfig.poToken).toBe('po-token-123');
			expect(mockCreateWebPoMinter).toHaveBeenCalledTimes(1);
		});

		it('should create a new BotGuard session once the cached one expires', async () => {
			mockCreateWebPoMinter.mockResolvedValueOnce({
				minter: createMockMinter('expired-token'),
				expiresAt: Date.now() - 1,
			});

			await startStream();
			const config = await startStream();

			expect(config.poToken).toBe('po-token-123');
			expect(mockCreateWebPoMinter).toHaveBeenCalledTimes(2);
		});

		it('should mint with the cached session while attestation is accepted', async () => {
			const config = await startStream();

			statusListener({ status: 1 });
			const token = await config.callbacks.onMintPoToken();

			expect(new TextDecoder().decode(token)).toBe('po-token-123');
			expect(mockCreateWebPoMinter).toHaveBeenCalledTimes(1);
		});

		it('should create a new BotGuard session when attestation is not accepted', async () => {
			const config = await startStream();

			mockCreateWebPoMinter.mockResolvedValueOnce({
				minter: createMockMinter('fresh-token'),
				expiresAt: Number.POSITIVE_INFINITY,
			});
			statusListener({ status: 2 });
			const token = await config.callbacks.onMintPoToken();

			expect(new TextDecoder().decode(token)).toBe('fresh-token');
			expect(mockCreateWebPoMinter).toHaveBeenCalledTimes(2);
		});

		it('should stop creating new BotGuard sessions after 10 attempts per stream', async () => {
			const config = await startStream();

			for (let attempt = 0; attempt < 12; attempt++) {
				statusListener({ status: 3 });
				await config.callbacks.onMintPoToken();
			}

			expect(mockCreateWebPoMinter).toHaveBeenCalledTimes(11);
		});

		it('should reload streaming data with the playback context', async () => {
			const config = await startStream();
			const reloadPlaybackContext = { reloadPlaybackParams: 'params' };

			const streamingData = await config.callbacks.onReloadPlayerResponse(
				reloadPlaybackContext,
			);

			expect(mockNavigationEndpointCall).toHaveBeenLastCalledWith(
				mockInnertube.actions,
				expect.objectContaining({
					playbackContext: expect.objectContaining({
						reloadPlaybackContext,
					}),
				}),
			);
			expect(streamingData).toEqual({
				serverAbrStreamingUrl: 'https://example.com/stream?deciphered',
				videoPlaybackUstreamerConfig: 'config-data',
			});
		});
	});

	describe('stream recovery', () => {
		const snapshot = { playerTimeMs: 10_000, tracks: [{ itag: 251 }] };
		let listeners: Map<string, () => void>;

		beforeEach(async () => {
			vi.spyOn(console, 'warn').mockImplementation(() => {});
			vi.spyOn(console, 'error').mockImplementation(() => {});
			listeners = new Map();
			mockInnertube.session.player.decipher.mockResolvedValue(
				'https://deciphered.com/stream',
			);
			mockNavigationEndpointCall.mockResolvedValue({
				streaming_data: {
					server_abr_streaming_url: 'https://example.com/stream',
					adaptive_formats: [{ itag: 251 }],
				},
				player_config: {
					media_common_config: {
						media_ustreamer_request_config: {
							video_playback_ustreamer_config: 'config-data',
						},
					},
				},
			} as never);
			mockSabrStream.on.mockImplementation(
				(event: string, listener: () => void) => {
					listeners.set(event, listener);
				},
			);
			mockSabrStream.snapshot.mockResolvedValue(snapshot);

			await extractor.activate();
		});

		function failingAudioStream(chunk: number[], error: Error) {
			return new ReadableStream({
				async start(controller) {
					controller.enqueue(new Uint8Array(chunk));
					await new Promise((resolve) => setTimeout(resolve, 0));
					listeners.get('trackStateUpdate')?.();
					await new Promise((resolve) => setTimeout(resolve, 10));
					controller.error(error);
				},
			});
		}

		function completeAudioStream(chunk: number[]) {
			return new ReadableStream({
				start(controller) {
					controller.enqueue(new Uint8Array(chunk));
					controller.close();
				},
			});
		}

		async function collect(stream: PassThrough): Promise<number[]> {
			const bytes: number[] = [];

			for await (const chunk of stream) {
				bytes.push(...chunk);
			}

			return bytes;
		}

		it('should resume from the last snapshot when SABR fails mid-stream', async () => {
			mockSabrStream.start
				.mockImplementationOnce(() => ({
					audioStream: failingAudioStream(
						[1, 2],
						new Error('Stream stalled 3 times. Aborting'),
					),
				}))
				.mockImplementationOnce(() => ({
					audioStream: completeAudioStream([3, 4]),
				}));

			const setMetadata = vi.fn();
			const stream = await extractor.stream({
				url: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
				metadata: {},
				setMetadata,
			} as unknown as Track);

			expect(await collect(stream as PassThrough)).toEqual([1, 2, 3, 4]);
			expect(mockSabrStream.start).toHaveBeenLastCalledWith(
				expect.objectContaining({ snapshot }),
			);
			expect(setMetadata).not.toHaveBeenCalled();
		});

		it('should set `streamError` after 3 failed resume attempts', async () => {
			const sabrError = new Error('Stream stalled 3 times. Aborting');

			mockSabrStream.start.mockImplementation(() => ({
				audioStream: failingAudioStream([1], sabrError),
			}));

			const setMetadata = vi.fn();
			const stream = await extractor.stream({
				url: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
				metadata: {},
				setMetadata,
			} as unknown as Track);

			expect(await collect(stream as PassThrough)).toEqual([1, 1, 1, 1]);
			expect(mockSabrStream.start).toHaveBeenCalledTimes(4);
			expect(setMetadata).toHaveBeenCalledWith({ streamError: sabrError });
		});
	});

	describe('getRelatedTracks', () => {
		beforeEach(async () => {
			await extractor.activate();
		});

		it('should throw error if not initialized', async () => {
			const uninitializedExtractor = new YoutubeSabrExtractor(
				{} as never,
				mockPlayer,
			);

			await expect(
				uninitializedExtractor.getRelatedTracks({
					url: 'https://youtube.com/watch?v=test',
				} as Track),
			).rejects.toThrow('YoutubeSabrExtractor not initialized');
		});

		it('should return empty result for invalid URL', async () => {
			const result = await extractor.getRelatedTracks({
				url: 'https://invalid.com/video',
			} as Track);

			expect(result.tracks).toHaveLength(0);
		});

		it('should return related tracks', async () => {
			const mockVideoInfo = {
				watch_next_feed: [
					{
						type: 'CompactVideo',
						id: 'related-1',
						title: { text: 'Related Video 1' },
						author: { name: 'Author 1' },
						duration: { seconds: 120 },
						thumbnails: [{ url: 'https://example.com/thumb1.jpg' }],
						view_count: { text: '1,000' },
					},
					{
						type: 'CompactVideo',
						id: 'related-2',
						title: { text: 'Related Video 2' },
						author: { name: 'Author 2' },
						duration: { seconds: 180 },
						thumbnails: [{ url: 'https://example.com/thumb2.jpg' }],
						view_count: { text: '2,000' },
					},
					{
						type: 'OtherType',
						id: 'other-1',
					},
				],
			};

			mockInnertube.getBasicInfo.mockResolvedValue(mockVideoInfo);

			const result = await extractor.getRelatedTracks({
				url: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
				requestedBy: { id: 'user-123' },
			} as Track);

			expect(result.tracks).toHaveLength(2);
			expect(result.tracks[0].title).toBe('Related Video 1');
			expect(result.tracks[1].title).toBe('Related Video 2');
		});

		it('should limit related tracks to MAX_RELATED_TRACKS', async () => {
			const mockVideoInfo = {
				watch_next_feed: Array.from({ length: 10 }, (_, i) => ({
					type: 'CompactVideo',
					id: `related-${i}`,
					title: { text: `Related Video ${i}` },
					author: { name: 'Author' },
					duration: { seconds: 120 },
				})),
			};

			mockInnertube.getBasicInfo.mockResolvedValue(mockVideoInfo);

			const result = await extractor.getRelatedTracks({
				url: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
				requestedBy: { id: 'user-123' },
			} as Track);

			expect(result.tracks).toHaveLength(5); // MAX_RELATED_TRACKS
		});

		it('should handle errors gracefully', async () => {
			mockInnertube.getBasicInfo.mockRejectedValue(
				new Error('Failed to get video info'),
			);

			const result = await extractor.getRelatedTracks({
				url: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
				requestedBy: { id: 'user-123' },
			} as Track);

			expect(result.tracks).toHaveLength(0);
		});

		it('should skip related videos without id', async () => {
			const mockVideoInfo = {
				watch_next_feed: [
					{
						type: 'CompactVideo',
						title: { text: 'No ID' },
					},
					{
						type: 'CompactVideo',
						id: 'related-1',
						title: { text: 'Valid Video' },
						author: { name: 'Author' },
						duration: { seconds: 120 },
					},
				],
			};

			mockInnertube.getBasicInfo.mockResolvedValue(mockVideoInfo);

			const result = await extractor.getRelatedTracks({
				url: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
				requestedBy: { id: 'user-123' },
			} as Track);

			expect(result.tracks).toHaveLength(1);
			expect(result.tracks[0].title).toBe('Valid Video');
		});

		it('should handle missing watch_next_feed', async () => {
			mockInnertube.getBasicInfo.mockResolvedValue({});

			const result = await extractor.getRelatedTracks({
				url: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
				requestedBy: { id: 'user-123' },
			} as Track);

			expect(result.tracks).toHaveLength(0);
		});

		it('should handle watch_next_feed with no CompactVideo items', async () => {
			const mockVideoInfo = {
				watch_next_feed: [
					{
						type: 'OtherType',
						id: 'other-1',
					},
					{
						type: 'AnotherType',
						id: 'other-2',
					},
				],
			};

			mockInnertube.getBasicInfo.mockResolvedValue(mockVideoInfo);

			const result = await extractor.getRelatedTracks({
				url: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
				requestedBy: { id: 'user-123' },
			} as Track);

			expect(result.tracks).toHaveLength(0);
		});
	});

	describe('track creation', () => {
		beforeEach(async () => {
			await extractor.activate();
		});

		it('should handle missing metadata gracefully', async () => {
			const mockVideoInfo = {
				basic_info: {
					title: 'Test Video',
					// Missing author, duration, thumbnail, view_count
				},
			};

			mockInnertube.getBasicInfo.mockResolvedValue(mockVideoInfo);

			const result = await extractor.handle(
				'https://youtube.com/watch?v=dQw4w9WgXcQ',
				{
					requestedBy: { id: 'user-123' },
				} as never,
			);

			expect(result.tracks).toHaveLength(1);
			expect(result.tracks[0].title).toBe('Test Video');
			expect(result.tracks[0].author).toBe('Unknown');
			expect(result.tracks[0].duration).toBe('0:00');
			expect(result.tracks[0].views).toBe(0);
		});

		it('should parse duration correctly for hours', async () => {
			const mockVideoInfo = {
				basic_info: {
					title: 'Long Video',
					author: 'Author',
					duration: 7265, // 2:01:05
					thumbnail: [{ url: 'https://example.com/thumb.jpg' }],
				},
			};

			mockInnertube.getBasicInfo.mockResolvedValue(mockVideoInfo);

			const result = await extractor.handle(
				'https://youtube.com/watch?v=test',
				{
					requestedBy: { id: 'user-123' },
				} as never,
			);

			expect(result.tracks[0].duration).toBeDefined();
			expect(result.tracks[0].duration).toMatch(/:/);
		});

		it('should parse duration correctly for exactly one hour', async () => {
			const mockVideoInfo = {
				basic_info: {
					title: 'One Hour Video',
					author: 'Author',
					duration: 3600, // 1:00:00
					thumbnail: [{ url: 'https://example.com/thumb.jpg' }],
				},
			};

			mockInnertube.getBasicInfo.mockResolvedValue(mockVideoInfo);

			const result = await extractor.handle(
				'https://youtube.com/watch?v=test',
				{
					requestedBy: { id: 'user-123' },
				} as never,
			);

			expect(result.tracks[0].duration).toMatch(/^\d+:\d{2}(:\d{2})?$/);
		});

		it('should parse duration correctly for minutes', async () => {
			const mockVideoInfo = {
				basic_info: {
					title: 'Short Video',
					author: 'Author',
					duration: 125, // 2:05
					thumbnail: [{ url: 'https://example.com/thumb.jpg' }],
				},
			};

			mockInnertube.getBasicInfo.mockResolvedValue(mockVideoInfo);

			const result = await extractor.handle(
				'https://youtube.com/watch?v=test',
				{
					requestedBy: { id: 'user-123' },
				} as never,
			);

			// Duration should be formatted
			expect(result.tracks[0].duration).toContain(':');
			expect(result.tracks).toHaveLength(1);
		});

		it('should parse view count from text', async () => {
			const mockSearchResults = {
				videos: [
					{
						id: 'video-1',
						title: { text: 'Popular Video' },
						author: { name: 'Author' },
						duration: { seconds: 120 },
						view_count: { text: '1,234,567 views' },
					},
				],
				slice: vi.fn().mockReturnThis(),
			};

			mockSearchResults.slice = vi
				.fn()
				.mockReturnValue(mockSearchResults.videos);
			mockInnertube.search.mockResolvedValue(mockSearchResults);

			const result = await extractor.handle('test query', {
				requestedBy: { id: 'user-123' },
			} as never);

			expect(result.tracks[0].views).toBe(1234567);
		});
	});

	describe('URL extraction', () => {
		it('should extract video ID from standard URL', async () => {
			await extractor.activate();

			const mockVideoInfo = {
				basic_info: {
					title: 'Test Video',
					author: 'Author',
				},
			};

			mockInnertube.getBasicInfo.mockResolvedValue(mockVideoInfo);

			await extractor.handle('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
				requestedBy: { id: 'user-123' },
			} as never);

			expect(mockInnertube.getBasicInfo).toHaveBeenCalledWith('dQw4w9WgXcQ');
		});

		it('should extract video ID from short URL', async () => {
			await extractor.activate();

			const mockVideoInfo = {
				basic_info: {
					title: 'Test Video',
					author: 'Author',
				},
			};

			mockInnertube.getBasicInfo.mockResolvedValue(mockVideoInfo);

			await extractor.handle('https://youtu.be/dQw4w9WgXcQ', {
				requestedBy: { id: 'user-123' },
			} as never);

			expect(mockInnertube.getBasicInfo).toHaveBeenCalledWith('dQw4w9WgXcQ');
		});

		it('should extract video ID from URL with query parameters', async () => {
			await extractor.activate();

			const mockVideoInfo = {
				basic_info: {
					title: 'Test Video',
					author: 'Author',
				},
			};

			mockInnertube.getBasicInfo.mockResolvedValue(mockVideoInfo);

			await extractor.handle(
				'https://youtu.be/dQw4w9WgXcQ?si=ngWivKeYJBT4WDq6',
				{
					requestedBy: { id: 'user-123' },
				} as never,
			);

			expect(mockInnertube.getBasicInfo).toHaveBeenCalledWith('dQw4w9WgXcQ');
		});

		it('should extract playlist ID from standard URL with query parameters', async () => {
			await extractor.activate();

			const mockVideoInfo = {
				info: {
					title: 'Playlist title',
					author: {},
				},
				has_continuation: false,
				videos: [],
			};

			mockInnertube.getPlaylist.mockResolvedValue(mockVideoInfo);

			await extractor.handle(
				'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLE0hg-LdSfycrpTtMImPSqFLle4yYNzWD',
				{
					requestedBy: { id: 'user-123' },
				} as never,
			);

			expect(mockInnertube.getPlaylist).toHaveBeenCalledWith(
				'PLE0hg-LdSfycrpTtMImPSqFLle4yYNzWD',
			);
		});

		it('should extract playlist ID from playlist URL', async () => {
			await extractor.activate();

			const mockVideoInfo = {
				info: {
					title: 'Playlist title',
					author: {},
				},
				has_continuation: false,
				videos: [],
			};

			mockInnertube.getPlaylist.mockResolvedValue(mockVideoInfo);

			await extractor.handle(
				'https://www.youtube.com/playlist?list=PLE0hg-LdSfycrpTtMImPSqFLle4yYNzWD',
				{
					requestedBy: { id: 'user-123' },
				} as never,
			);

			expect(mockInnertube.getPlaylist).toHaveBeenCalledWith(
				'PLE0hg-LdSfycrpTtMImPSqFLle4yYNzWD',
			);
		});
	});
});
