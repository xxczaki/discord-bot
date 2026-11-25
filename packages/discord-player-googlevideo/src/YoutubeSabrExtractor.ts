import { PassThrough } from 'node:stream';
import {
	BaseExtractor,
	type ExtractorInfo,
	type ExtractorSearchContext,
	type ExtractorStreamable,
	Playlist,
	type SearchQueryType,
	Track,
} from 'discord-player';
import type { ReloadPlaybackContext } from 'googlevideo/protos';
import { type SabrSnapshot, SabrStream } from 'googlevideo/sabr-stream';
import {
	buildSabrFormat,
	EnabledTrackTypes,
	Logger,
	LogLevel,
} from 'googlevideo/utils';
import {
	Constants,
	Innertube,
	Platform,
	type Types,
	UniversalCache,
	YTNodes,
} from 'youtubei.js';
import {
	createWebPoMinter,
	type WebPoMinterSession,
} from './utils/generateWebPoToken.js';

const MAX_SEARCH_RESULTS = 10;
const MAX_RELATED_TRACKS = 5;
const MAX_MINTER_REFRESHES_PER_STREAM = 10;
const STREAM_PROTECTION_STATUS_OK = 1;
const MAX_RESUME_ATTEMPTS = 3;
const STALL_DETECTION_MS = 10_000;
const YOUTUBE_URL_REGEX =
	/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
const YOUTUBE_PLAYLIST_REGEX =
	/youtube\.com\/(?:watch|playlist).*[&?]list=([a-zA-Z0-9_-]{34})/;
const YOUTUBE_DOMAIN_REGEX = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

type VideoData = {
	id: string;
	title?: { text?: string };
	author?: { name?: string };
	duration?: { seconds?: number };
	thumbnails?: Array<{ url?: string }>;
	view_count?: { text?: string };
};

/**
 * YouTube player response format structure
 * Simplified subset of the full YouTube API response
 */
type AdaptiveFormat = {
	itag?: number;
	url?: string;
	mimeType?: string;
	bitrate?: number;
	width?: number;
	height?: number;
	initRange?: { start: string; end: string };
	indexRange?: { start: string; end: string };
	lastModified?: string;
	contentLength?: string;
	quality?: string;
	fps?: number;
	qualityLabel?: string;
	projectionType?: string;
	averageBitrate?: number;
	approxDurationMs?: string;
};

type StreamingData = {
	serverAbrStreamingUrl: string;
	videoPlaybackUstreamerConfig: string;
};

type PlayerResponse = {
	streaming_data?: {
		server_abr_streaming_url?: string;
		adaptive_formats: AdaptiveFormat[];
	};
	player_config?: {
		media_common_config: {
			media_ustreamer_request_config?: {
				video_playback_ustreamer_config?: string;
			};
		};
	};
};

/* v8 ignore start */
function setupYoutubeJsEvaluator() {
	Platform.shim.eval = async (
		data: Types.BuildScriptResult,
		env: Record<string, Types.VMPrimative>,
	) => {
		const properties = [];

		if (env.n) {
			properties.push(`n: exportedVars.nFunction("${env.n}")`);
		}

		if (env.sig) {
			properties.push(`sig: exportedVars.sigFunction("${env.sig}")`);
		}

		const code = `${data.output}\nreturn { ${properties.join(', ')} }`;

		return new Function(code)();
	};
}
/* v8 ignore stop */

export class YoutubeSabrExtractor extends BaseExtractor {
	static identifier = 'com.github.xxczaki.youtube-sabr' as const;

	#innertube: Innertube | null = null;
	#webPoMinter: Promise<WebPoMinterSession> | null = null;

	async activate(): Promise<void> {
		setupYoutubeJsEvaluator();
		Logger.getInstance().setLogLevels(
			LogLevel.ERROR,
			LogLevel.WARN,
			LogLevel.INFO,
		);

		this.#innertube = await Innertube.create({
			cache: new UniversalCache(true, '/tmp/.cache'),
		});

		this.protocols = ['ytsearch', 'youtube'];
	}

	async deactivate(): Promise<void> {
		this.#innertube = null;
		this.#webPoMinter = null;
	}

	async validate(
		query: string,
		type?: SearchQueryType | null,
	): Promise<boolean> {
		if (type === 'arbitrary') {
			return false;
		}

		return (
			YOUTUBE_DOMAIN_REGEX.test(query) ||
			query.startsWith('youtube:') ||
			query.startsWith('ytsearch:')
		);
	}

	async handle(
		query: string,
		context: ExtractorSearchContext,
	): Promise<ExtractorInfo> {
		if (!this.#innertube) {
			throw new Error('YoutubeSabrExtractor not initialized');
		}

		const cleanQuery = query.replace(/^(youtube:|ytsearch:)/, '').trim();
		const playlistId = this.#extractPlaylistId(cleanQuery);

		if (playlistId) {
			return this.#handleDirectPlaylist(playlistId, context);
		}

		const videoId = this.#extractVideoId(cleanQuery);

		if (videoId) {
			return this.#handleDirectVideo(videoId, context);
		}

		return this.#handleSearch(cleanQuery, context);
	}

	async stream(track: Track): Promise<ExtractorStreamable> {
		if (!this.#innertube) {
			throw new Error('YoutubeSabrExtractor not initialized');
		}

		const videoId = this.#extractVideoId(track.url);

		if (!videoId) {
			throw new Error('Invalid YouTube URL');
		}

		const outputStream = new PassThrough();
		const failStream = (error: unknown) => {
			console.error('[YoutubeSabrExtractor] Stream error:', error);

			track.setMetadata({
				...(isRecord(track.metadata) ? track.metadata : {}),
				streamError: error,
			});

			if (!outputStream.destroyed) {
				outputStream.end();
			}
		};

		/* v8 ignore start */
		this.#startStream(videoId, outputStream, failStream).catch(failStream);
		/* v8 ignore stop */

		return outputStream;
	}

	/* v8 ignore start */
	async #startStream(
		videoId: string,
		outputStream: PassThrough,
		failStream: (error: unknown) => void,
	): Promise<void> {
		let activeStream: SabrStream | undefined;
		let latestSnapshot: SabrSnapshot | undefined;
		let bytesWritten = 0;

		outputStream.once('close', () => {
			void activeStream?.abort();
		});

		for (let attempt = 0; ; attempt++) {
			try {
				const sabrStream = await this.#openSabrStream(videoId);
				activeStream = sabrStream;

				sabrStream.on('trackStateUpdate', () => {
					sabrStream
						.snapshot()
						.then((snapshot) => {
							latestSnapshot = snapshot;
						})
						.catch(() => {});
				});

				const { audioStream } = sabrStream.start({
					audioPreferences: { quality: 'AUDIO_QUALITY_MEDIUM' },
					enabledTrackTypes: EnabledTrackTypes.AUDIO_ONLY,
					isPostLiveDvr: false,
					stallDetectionMs: STALL_DETECTION_MS,
					...(latestSnapshot ? { snapshot: latestSnapshot } : {}),
				});

				const reader = audioStream.getReader();

				for (;;) {
					const { done, value } = await reader.read();

					if (done) {
						break;
					}

					if (outputStream.destroyed) {
						return;
					}

					bytesWritten += value.byteLength;
					outputStream.write(value);
				}

				sabrStream.removeAllListeners();

				if (!outputStream.destroyed) {
					outputStream.end();
				}

				return;
			} catch (error) {
				activeStream?.removeAllListeners();

				if (outputStream.destroyed) {
					return;
				}

				const canResume =
					attempt < MAX_RESUME_ATTEMPTS &&
					(latestSnapshot !== undefined || bytesWritten === 0);

				if (!canResume) {
					failStream(error);
					return;
				}

				console.warn(
					`[YoutubeSabrExtractor] Stream for ${videoId} failed, resuming from ${latestSnapshot?.playerTimeMs ?? 0}ms (attempt ${attempt + 1}/${MAX_RESUME_ATTEMPTS}):`,
					error,
				);
			}
		}
	}
	/* v8 ignore stop */

	async #openSabrStream(videoId: string): Promise<SabrStream> {
		const playerResponse = await this.#makePlayerRequest(videoId);
		const streamingData = await this.#getStreamingData(playerResponse);

		const sabrFormats =
			playerResponse.streaming_data?.adaptive_formats.map((format) =>
				buildSabrFormat(format as never),
			) || [];

		let poToken: string | undefined;
		try {
			const { minter } = await this.#getWebPoMinter();
			poToken = await minter.mintAsWebsafeString(videoId);
		} catch (error) {
			console.warn(
				'[YoutubeSabrExtractor] Failed to generate PO token:',
				error,
			);
		}

		let attestationRejected = false;
		let minterRefreshes = 0;

		const sabrStream = new SabrStream({
			videoId,
			formats: sabrFormats,
			...streamingData,
			...(poToken ? { poToken } : {}),
			clientInfo: {
				clientName: Number.parseInt(
					Constants.CLIENT_NAME_IDS[
						this.#innertube?.session.context.client
							.clientName as keyof typeof Constants.CLIENT_NAME_IDS
					],
					10,
				),
				clientVersion: this.#innertube?.session.context.client.clientVersion,
			},
			callbacks: {
				onMintPoToken: async () => {
					const shouldRefresh =
						attestationRejected &&
						minterRefreshes < MAX_MINTER_REFRESHES_PER_STREAM;

					attestationRejected = false;

					if (shouldRefresh) {
						minterRefreshes++;
						console.warn(
							`[YoutubeSabrExtractor] PO token not accepted for ${videoId}, creating a new BotGuard session (${minterRefreshes}/${MAX_MINTER_REFRESHES_PER_STREAM})`,
						);
					}

					const { minter } = await (shouldRefresh
						? this.#refreshWebPoMinter()
						: this.#getWebPoMinter());

					return minter.mint(videoId);
				},
				onReloadPlayerResponse: async (reloadPlaybackContext) =>
					this.#getStreamingData(
						await this.#makePlayerRequest(videoId, reloadPlaybackContext),
					),
			},
		});

		sabrStream.on('streamProtectionStatusUpdate', ({ status }) => {
			if (status !== STREAM_PROTECTION_STATUS_OK) {
				attestationRejected = true;
			}
		});

		return sabrStream;
	}

	async getRelatedTracks(track: Track): Promise<ExtractorInfo> {
		if (!this.#innertube) {
			throw new Error('YoutubeSabrExtractor not initialized');
		}

		const videoId = this.#extractVideoId(track.url);

		if (!videoId) {
			return this.createResponse();
		}

		try {
			const videoInfo = await this.#innertube.getBasicInfo(videoId);
			const relatedVideos =
				videoInfo.watch_next_feed?.filter(
					(item) => item.type === 'CompactVideo',
				) || [];

			const tracks: Track[] = [];

			for (const video of relatedVideos.slice(0, MAX_RELATED_TRACKS)) {
				if (!('id' in video) || !video.id) {
					continue;
				}

				const videoData = video as VideoData;
				const relatedTrack = this.#createTrackFromVideoData(
					videoData,
					track.requestedBy,
					video,
				);

				tracks.push(relatedTrack);
			}

			return this.createResponse(null, tracks);
		} catch (error) {
			console.error(
				'[YoutubeSabrExtractor] Failed to get related tracks:',
				error,
			);
			return this.createResponse();
		}
	}

	async #handleDirectPlaylist(
		playlistId: string,
		context: ExtractorSearchContext,
	): Promise<ExtractorInfo> {
		/* v8 ignore start */
		if (!this.#innertube) {
			throw new Error('YoutubeSabrExtractor not initialized');
		}
		/* v8 ignore stop */

		const youtubePlaylist = await this.#innertube.getPlaylist(playlistId);

		if (!youtubePlaylist) {
			return this.createResponse();
		}

		while (youtubePlaylist.has_continuation) {
			await youtubePlaylist.getContinuation();
		}

		const tracks = await Promise.all(
			youtubePlaylist.videos
				.map((video) => {
					if (!('id' in video)) {
						return null;
					}

					return this.#createTrackFromVideoData(
						video as VideoData,
						context.requestedBy,
						video,
					);
				})
				.filter((track) => !!track),
		);

		const discordPlayerPlaylist = new Playlist(this.context.player, {
			title: youtubePlaylist.info.title || 'Unknown',
			author: {
				url: youtubePlaylist.info.author.url || '',
				name: youtubePlaylist.info.author.name,
			},
			type: 'playlist',
			url: `https://www.youtube.com/playlist?list=${playlistId}`,
			id: playlistId,
			source: 'youtube',
			rawPlaylist: youtubePlaylist,
			thumbnail: youtubePlaylist.info.thumbnails?.[0]?.url,
			description: youtubePlaylist.info.description || 'Unknown',
			tracks,
		});

		return this.createResponse(discordPlayerPlaylist);
	}

	async #handleDirectVideo(
		videoId: string,
		context: ExtractorSearchContext,
	): Promise<ExtractorInfo> {
		/* v8 ignore start */
		if (!this.#innertube) {
			throw new Error('YoutubeSabrExtractor not initialized');
		}
		/* v8 ignore stop */

		const videoInfo = await this.#innertube.getBasicInfo(videoId);

		if (!videoInfo.basic_info) {
			return this.createResponse();
		}

		const track = this.#createTrackFromBasicInfo(
			videoId,
			videoInfo.basic_info,
			context.requestedBy,
			videoInfo,
		);

		return this.createResponse(null, [track]);
	}

	async #handleSearch(
		query: string,
		context: ExtractorSearchContext,
	): Promise<ExtractorInfo> {
		/* v8 ignore start */
		if (!this.#innertube) {
			throw new Error('YoutubeSabrExtractor not initialized');
		}
		/* v8 ignore stop */

		try {
			const searchResults = await this.#innertube.search(query, {
				type: 'video',
			});

			const tracks: Track[] = [];

			for (const video of searchResults.videos.slice(0, MAX_SEARCH_RESULTS)) {
				if (!('id' in video)) {
					continue;
				}

				const videoData = video as VideoData;
				const track = this.#createTrackFromVideoData(
					videoData,
					context.requestedBy,
					video,
				);

				tracks.push(track);
			}

			return this.createResponse(null, tracks);
		} catch (error) {
			console.error('[YoutubeSabrExtractor] Failed to search YouTube:', error);
			return this.createResponse();
		}
	}

	#createTrackFromBasicInfo(
		videoId: string,
		basicInfo: {
			title?: string;
			author?: string;
			duration?: number;
			thumbnail?: Array<{ url?: string }>;
			view_count?: number;
		},
		requestedBy: ExtractorSearchContext['requestedBy'],
		raw: unknown,
	): Track {
		const track = new Track(this.context.player, {
			title: basicInfo.title || 'Unknown',
			author: basicInfo.author || 'Unknown',
			url: `https://youtube.com/watch?v=${videoId}`,
			duration: this.#parseDuration(basicInfo.duration || 0),
			thumbnail: basicInfo.thumbnail?.[0]?.url,
			views: basicInfo.view_count || 0,
			requestedBy,
			source: 'youtube',
			raw,
		});

		track.extractor = this;

		return track;
	}

	#createTrackFromVideoData(
		videoData: VideoData,
		requestedBy: ExtractorSearchContext['requestedBy'],
		raw: unknown,
	): Track {
		const track = new Track(this.context.player, {
			title: videoData.title?.text || 'Unknown',
			author: videoData.author?.name || 'Unknown',
			url: `https://youtube.com/watch?v=${videoData.id}`,
			duration: this.#parseDuration(videoData.duration?.seconds || 0),
			thumbnail: videoData.thumbnails?.[0]?.url,
			views: Number.parseInt(
				videoData.view_count?.text?.replace(/\D/g, '') || '0',
				10,
			),
			requestedBy,
			source: 'youtube',
			raw,
		});

		track.extractor = this;

		return track;
	}

	#extractVideoId(url: string): string | null {
		const match = url.match(YOUTUBE_URL_REGEX);
		return match?.[1] || null;
	}

	#extractPlaylistId(url: string): string | null {
		const match = url.match(YOUTUBE_PLAYLIST_REGEX);
		return match?.[1] || null;
	}

	#parseDuration(seconds: number): string {
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		const secs = seconds % 60;

		/* v8 ignore start */
		if (hours > 0) {
			return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
		}
		/* v8 ignore stop */

		return `${minutes}:${secs.toString().padStart(2, '0')}`;
	}

	async #getStreamingData(
		playerResponse: PlayerResponse,
	): Promise<StreamingData> {
		const serverAbrStreamingUrl =
			await this.#innertube?.session.player?.decipher(
				playerResponse.streaming_data?.server_abr_streaming_url,
			);

		const videoPlaybackUstreamerConfig =
			playerResponse.player_config?.media_common_config
				.media_ustreamer_request_config?.video_playback_ustreamer_config;

		if (!videoPlaybackUstreamerConfig) {
			throw new Error('Streaming configuration not available');
		}

		if (!serverAbrStreamingUrl) {
			throw new Error('Streaming URL not available');
		}

		return { serverAbrStreamingUrl, videoPlaybackUstreamerConfig };
	}

	#getWebPoMinter(): Promise<WebPoMinterSession> {
		const cached = this.#webPoMinter;

		if (cached) {
			return cached.then((session) =>
				session.expiresAt > Date.now() ? session : this.#refreshWebPoMinter(),
			);
		}

		return this.#refreshWebPoMinter();
	}

	#refreshWebPoMinter(): Promise<WebPoMinterSession> {
		const session = createWebPoMinter();

		this.#webPoMinter = session;
		session.catch(() => {
			if (this.#webPoMinter === session) {
				this.#webPoMinter = null;
			}
		});

		return session;
	}

	async #makePlayerRequest(
		videoId: string,
		reloadPlaybackContext?: ReloadPlaybackContext,
	): Promise<PlayerResponse> {
		/* v8 ignore start */
		if (!this.#innertube) {
			throw new Error('YoutubeSabrExtractor not initialized');
		}
		/* v8 ignore stop */

		const watchEndpoint = new YTNodes.NavigationEndpoint({
			watchEndpoint: { videoId },
		});

		const playbackContext = {
			contentPlaybackContext: {
				vis: 0,
				splay: false,
				lactMilliseconds: '-1',
				signatureTimestamp: this.#innertube.session.player?.signature_timestamp,
			},
			...(reloadPlaybackContext ? { reloadPlaybackContext } : {}),
		};

		const extraArgs = {
			playbackContext,
			contentCheckOk: true,
			racyCheckOk: true,
			parse: true as const,
		};

		const response = await watchEndpoint.call(
			this.#innertube.actions,
			extraArgs,
		);
		return response as PlayerResponse;
	}
}
