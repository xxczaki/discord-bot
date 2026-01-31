import { createServer, type Server } from 'node:net';
import { captureException } from '@sentry/node';
import {
	type Client,
	EmbedBuilder,
	type InteractionEditReplyOptions,
	type InteractionReplyOptions,
	type Message,
} from 'discord.js';
import type { GuildQueue, Player } from 'discord-player';
import enqueueTracks from '../utils/enqueueTracks';
import formatDuration from '../utils/formatDuration';
import formatRelativeTime from '../utils/formatRelativeTime';
import getEnvironmentVariable from '../utils/getEnvironmentVariable';
import isObject from '../utils/isObject';
import logger from '../utils/logger';
import { OpusCacheManager } from '../utils/OpusCacheManager';
import pluralize from '../utils/pluralize';
import { QueueRecoveryService } from '../utils/QueueRecoveryService';
import reportError from '../utils/reportError';

const FATAL_ERROR_MESSAGE_DEBOUNCE = 1000 * 30; // 30 seconds

const botDebugChannelId = getEnvironmentVariable('BOT_DEBUG_CHANNEL_ID');
const pluralizeTracks = pluralize('track', 'tracks');

const server = createServer();

server.listen(8000);

export default function useDebugListeners(
	client: Client<boolean>,
	player: Player,
) {
	const reportUnhandledError = initializeUnhandledErrorReporter(client, server);

	process.on('unhandledRejection', reportUnhandledError);
	process.on('uncaughtException', reportUnhandledError);

	client.on('error', (error) => {
		reportError(error, 'Discord client error');
	});

	const reportPlayerError = initializePlayerErrorReporter(client, player);

	player.on('error', async (error) => reportPlayerError(undefined, error));
	player.events.on('error', reportPlayerError);
	player.events.on('playerError', reportPlayerError);

	player.on('debug', (message) => logger.debug({}, message));
	player.events.on('debug', (_, message) => logger.debug({}, message));
}

function initializeUnhandledErrorReporter(
	client: Client<boolean>,
	server: Server,
) {
	let previousMessageTimestamp = 0;

	return async (payload: unknown) => {
		reportError(payload, 'Uncaught exception/rejection');

		const channel = client.channels.cache.get(botDebugChannelId);

		if (
			channel?.isSendable() &&
			getEnvironmentVariable('NODE_ENV') !== 'development' &&
			Date.now() - previousMessageTimestamp > FATAL_ERROR_MESSAGE_DEBOUNCE
		) {
			previousMessageTimestamp = Date.now();

			await channel.send(
				'Encountered a fatal error, the bot will restart promptly. Consider using `/recover` afterward.',
			);

			server.close();
		}
	};
}

function initializePlayerErrorReporter(
	client: Client<boolean>,
	player: Player,
) {
	return async (queue: GuildQueue | undefined, error: Error) => {
		logger.error(error, 'Player error');

		const debugChannel = client.channels.cache.get(botDebugChannelId);

		if (!debugChannel?.isSendable()) {
			return;
		}

		// YouTube resolution issue
		if (
			error.name === 'NoResultError' ||
			('code' in error && error.code === 'ERR_NO_RESULT')
		) {
			const currentTrack = queue?.currentTrack;
			const trackInfo = currentTrack
				? `**${currentTrack.title}** by ${currentTrack.author}`
				: 'Unknown track';

			const embed = new EmbedBuilder()
				.setTitle('Track Unavailable')
				.setDescription(
					`Could not play ${trackInfo}.\n\nThis track appears to be unplayable (possibly region-locked, removed, or restricted). The queue will continue with the next track.`,
				)
				.setColor('Orange');

			return debugChannel.send({ embeds: [embed] });
		}

		const sentryId = captureException(error);

		const embed = new EmbedBuilder()
			.setTitle('Player Error')
			.setDescription('Attempting to recover…')
			.setColor('Red')
			.setFields([
				{
					name: 'Sentry Issue ID',
					value: sentryId ? `\`${sentryId}\`` : 'Unavailable',
				},
			]);

		const message = await debugChannel.send({ embeds: [embed] });

		try {
			if (!queue) {
				embed.setDescription('🛑 Unable to recover – no queue found.');
				return message.edit({ embeds: [embed] });
			}

			const track = queue.currentTrack;

			if (
				track &&
				isObject(track.metadata) &&
				!('isFromCache' in track.metadata)
			) {
				const opusCacheManager = OpusCacheManager.getInstance();
				const filename = opusCacheManager.generateFilename({
					title: track.cleanTitle,
					author: track.author,
					durationMS: track.durationMS,
				});

				void opusCacheManager.deleteEntry(filename);
			}

			if (!queue.channel) {
				embed.setDescription(
					'Unable to recover. The queue has no voice channel associated with it.\n\nTip: Try using the `/recover` command directly.',
				);
				return message.edit({ embeds: [embed] });
			}

			const queueRecoveryService = QueueRecoveryService.getInstance();

			if (!queueRecoveryService) {
				embed.setDescription(
					'Unable to recover. Queue recovery service unavailable.',
				);
				return message.edit({ embeds: [embed] });
			}

			const { tracks, progress, savedAt } =
				await queueRecoveryService.getContents(player);

			if (tracks.length === 0) {
				queue.delete();

				embed.setDescription('Found nothing to recover.');
				return message.edit({ embeds: [embed] });
			}

			const originalChannel = queue.metadata?.interaction?.channel;

			if (!originalChannel?.isSendable()) {
				embed.setDescription(
					'Unable to recover. Original channel not found.\n\nTip: Try using the `/recover` command directly.',
				);
				return message.edit({ embeds: [embed] });
			}

			const [currentTrack, ...queuedTracks] = tracks;

			const userEmbed = new EmbedBuilder()
				.setTitle('🔄 Automatic Queue Recovery')
				.setColor('Blue')
				.setDescription(
					pluralize(
						'track',
						'tracks',
					)`The bot encountered an error. Attempting to recover ${tracks.length} ${null}…`,
				)
				.addFields([
					{
						name: 'Current Track',
						value: `**${currentTrack.title}** by ${currentTrack.author}`,
						inline: false,
					},
					{
						name: 'Progress',
						value:
							progress > 0
								? formatDuration(progress)
								: 'Starting from beginning',
						inline: true,
					},
					{
						name: 'Queued Tracks',
						value: queuedTracks.length.toString(),
						inline: true,
					},
				]);

			if (savedAt) {
				userEmbed.addFields([
					{
						name: 'Last Saved',
						value: formatRelativeTime(savedAt),
						inline: true,
					},
				]);
			}

			let userMessage: Message | null = null;

			try {
				userMessage = await originalChannel.send({ embeds: [userEmbed] });
			} catch (error) {
				logger.error(
					error,
					'Failed to send recovery message to original channel',
				);
			}

			const messageEditHandler = (
				options: InteractionEditReplyOptions | InteractionReplyOptions,
			) => {
				const { flags: _flags, ...messageOptions } = options;

				if (userMessage) {
					void userMessage.edit(messageOptions);
				}

				return message.edit(messageOptions);
			};

			await enqueueTracks({
				tracks,
				progress,
				voiceChannel: queue.channel,
				interaction: {
					editReply: messageEditHandler,
					reply: messageEditHandler,
					user: message.author,
					channel: originalChannel,
				},
			});

			embed.setDescription(
				pluralizeTracks`Recovery successful. ${tracks.length} ${null} restored.`,
			);
			await message.edit({ embeds: [embed] });
		} catch (error) {
			if (!(error instanceof Error)) {
				return;
			}

			embed.setDescription(`Recovery failed: ${error.message}`);

			await message.edit({ embeds: [embed] });
		}
	};
}
