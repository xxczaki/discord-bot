import { PassThrough, Readable } from 'node:stream';
import {
	BaseExtractor,
	type ExtractorInfo,
	type ExtractorSearchContext,
	type ExtractorStreamable,
	type SearchQueryType,
	Track,
} from 'discord-player';
import { SabrStream } from 'googlevideo/sabr-stream';
import { buildSabrFormat, EnabledTrackTypes } from 'googlevideo/utils';
import {
	Constants,
	Innertube,
	Platform,
	type Types,
	UniversalCache,
	YTNodes,
} from 'youtubei.js';
import { generateWebPoToken } from '../utils/generateWebPoToken';
import logger from '../utils/logger';

const MAX_SEARCH_RESULTS = 10;
const MAX_RELATED_TRACKS = 5;
const YOUTUBE_URL_REGEX = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/;
const YOUTUBE_SHORTS_REGEX = /youtube\.com\/shorts\/([^&\s]+)/;
const YOUTUBE_DOMAIN_REGEX = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//;

type VideoData = {
	id: string;
	title?: { text?: string };
	author?: { name?: string };
	duration?: { seconds?: number };
	thumbnails?: Array<{ url?: string }>;
	view_count?: { text?: string };
};

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

export class YoutubeSabrExtractor extends BaseExtractor {
	static identifier = 'com.github.xxczaki.youtube-sabr' as const;

	#innertube: Innertube | null = null;

	async activate(): Promise<void> {
		setupYoutubeJsEvaluator();

		this.#innertube = await Innertube.create({
			cache: new UniversalCache(true, '/tmp/.cache'),
		});

		this.protocols = ['ytsearch', 'youtube'];

		logger.info('YoutubeSabrExtractor activated');
	}

	async deactivate(): Promise<void> {
		this.#innertube = null;
		logger.info('YoutubeSabrExtractor deactivated');
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
		this.#startStreamWithReconnect(videoId, outputStream).catch((error) => {
			logger.error(error, 'Fatal error in stream');
			outputStream.destroy(error);
		});

		return outputStream;
	}

	async #startStreamWithReconnect(
		videoId: string,
		outputStream: PassThrough,
		reloadContext?: unknown,
		attempt = 1,
		previousState?: unknown,
	): Promise<void> {
		const MAX_RECONNECT_ATTEMPTS = 10;

		if (attempt > MAX_RECONNECT_ATTEMPTS) {
			throw new Error(
				`Maximum reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) exceeded`,
			);
		}

		if (attempt > 1) {
			logger.info({ videoId, attempt }, 'Reconnecting stream');
		}

		const playerResponse = await this.#makePlayerRequest(
			videoId,
			reloadContext,
		);

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

		const sabrFormats = (playerResponse.streaming_data?.adaptive_formats.map(
			// biome-ignore lint/suspicious/noExplicitAny: googlevideo types are not exported
			buildSabrFormat as any,
			// biome-ignore lint/suspicious/noExplicitAny: googlevideo types are not exported
		) || []) as any;

		// Generate PO token bound to video ID to authenticate stream
		let poToken: string | undefined;
		try {
			const poTokenResult = await generateWebPoToken(videoId);
			poToken = poTokenResult.poToken;
		} catch (error) {
			logger.warn({ error, videoId }, 'Failed to generate PO token');
		}

		const serverAbrStream = new SabrStream({
			formats: sabrFormats,
			serverAbrStreamingUrl,
			videoPlaybackUstreamerConfig,
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
		});

		let pendingReloadContext: unknown = null;
		let savedState: unknown = null;

		serverAbrStream.on('reloadPlayerResponse', (reloadPlaybackContext) => {
			pendingReloadContext = reloadPlaybackContext;
			try {
				savedState = serverAbrStream.getState();
			} catch {
				// Ignore state save errors
			}
		});

		try {
			const startOptions: {
				audioQuality: 'AUDIO_QUALITY_MEDIUM';
				enabledTrackTypes: typeof EnabledTrackTypes.AUDIO_ONLY;
				state?: unknown;
			} = {
				audioQuality: 'AUDIO_QUALITY_MEDIUM' as const,
				enabledTrackTypes: EnabledTrackTypes.AUDIO_ONLY,
			};

			if (previousState) {
				// biome-ignore lint/suspicious/noExplicitAny: SabrStreamState type is not exported
				startOptions.state = previousState as any;
			}

			// biome-ignore lint/suspicious/noExplicitAny: SabrPlaybackOptions accepts state but type is complex
			const { audioStream } = await serverAbrStream.start(startOptions as any);

			// biome-ignore lint/suspicious/noExplicitAny: ReadableStream type mismatch between DOM and Node.js
			const nodeStream = Readable.fromWeb(audioStream as any);

			nodeStream.on('data', (chunk) => {
				if (!outputStream.destroyed) {
					outputStream.write(chunk);
				}
			});

			nodeStream.on('end', () => {
				if (!outputStream.destroyed) {
					outputStream.end();
				}
				serverAbrStream.abort();
				serverAbrStream.removeAllListeners();
			});

			nodeStream.on('error', async (error) => {
				const isReconnectable =
					error.message?.includes('Player response reload requested') ||
					error.message?.includes('No media parts or protocol updates') ||
					error.message?.includes('Maximum retries') ||
					pendingReloadContext !== null;

				if (isReconnectable && !outputStream.destroyed) {
					serverAbrStream.abort();
					serverAbrStream.removeAllListeners();

					const contextToUse =
						pendingReloadContext !== null ? pendingReloadContext : undefined;

					await new Promise((resolve) => setTimeout(resolve, 1000));

					let streamState: unknown = null;
					try {
						streamState = savedState || serverAbrStream.getState();
					} catch {
						// Ignore state retrieval errors
					}

					try {
						await this.#startStreamWithReconnect(
							videoId,
							outputStream,
							contextToUse,
							attempt + 1,
							streamState || undefined,
						);
					} catch (reconnectError) {
						logger.error(
							{ error: reconnectError, videoId },
							'Reconnect failed',
						);
						if (!outputStream.destroyed) {
							outputStream.destroy(
								reconnectError instanceof Error
									? reconnectError
									: new Error(String(reconnectError)),
							);
						}
					}
				} else {
					logger.error({ error, videoId }, 'Stream error');
					serverAbrStream.removeAllListeners();
					if (!outputStream.destroyed) {
						outputStream.destroy(error);
					}
				}
			});
		} catch (error) {
			if (
				error instanceof Error &&
				(error.message?.includes('Player response reload requested') ||
					pendingReloadContext) &&
				!outputStream.destroyed
			) {
				return this.#startStreamWithReconnect(
					videoId,
					outputStream,
					pendingReloadContext || undefined,
					attempt + 1,
					savedState || undefined,
				);
			}
			logger.error({ error, videoId }, 'Fatal stream start error');
			throw error;
		}
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
			logger.error(error, 'Failed to get related tracks');
			return this.createResponse();
		}
	}

	async #handleDirectVideo(
		videoId: string,
		context: ExtractorSearchContext,
	): Promise<ExtractorInfo> {
		if (!this.#innertube) {
			throw new Error('YoutubeSabrExtractor not initialized');
		}

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
		if (!this.#innertube) {
			throw new Error('YoutubeSabrExtractor not initialized');
		}

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
			logger.error(
				{
					query,
					errorMessage: error instanceof Error ? error.message : String(error),
					errorName: error instanceof Error ? error.name : typeof error,
					errorStack:
						error instanceof Error
							? error.stack?.split('\n').slice(0, 5)
							: undefined,
				},
				'Failed to search YouTube with current client',
			);
			// Return empty results instead of throwing
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
		const match =
			url.match(YOUTUBE_URL_REGEX) || url.match(YOUTUBE_SHORTS_REGEX);
		return match?.[1] || null;
	}

	#parseDuration(seconds: number): string {
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		const secs = seconds % 60;

		if (hours > 0) {
			return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
		}

		return `${minutes}:${secs.toString().padStart(2, '0')}`;
	}

	async #makePlayerRequest(
		videoId: string,
		reloadPlaybackContext?: unknown,
	): Promise<{
		streaming_data?: {
			server_abr_streaming_url?: string;
			adaptive_formats: Array<{
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
			}>;
		};
		player_config?: {
			media_common_config: {
				media_ustreamer_request_config?: {
					video_playback_ustreamer_config?: string;
				};
			};
		};
	}> {
		if (!this.#innertube) {
			throw new Error('YoutubeSabrExtractor not initialized');
		}

		const watchEndpoint = new YTNodes.NavigationEndpoint({
			watchEndpoint: { videoId },
		});

		const playbackContext: Record<string, unknown> = {
			contentPlaybackContext: {
				vis: 0,
				splay: false,
				lactMilliseconds: '-1',
				signatureTimestamp: this.#innertube.session.player?.signature_timestamp,
			},
		};

		if (reloadPlaybackContext) {
			playbackContext.reloadPlaybackContext = reloadPlaybackContext;
		}

		const extraArgs: Record<string, unknown> = {
			playbackContext,
			contentCheckOk: true,
			racyCheckOk: true,
			parse: true,
		};

		const response = await watchEndpoint.call(
			this.#innertube.actions,
			extraArgs,
		);
		return response as {
			streaming_data?: {
				server_abr_streaming_url?: string;
				adaptive_formats: Array<{
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
				}>;
			};
			player_config?: {
				media_common_config: {
					media_ustreamer_request_config?: {
						video_playback_ustreamer_config?: string;
					};
				};
			};
		};
	}
}
