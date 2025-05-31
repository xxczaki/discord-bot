import { type Server, createServer } from 'node:net';
import { captureException } from '@sentry/node';
import { type GuildQueue, type Player, useMainPlayer } from 'discord-player';
import {
	type Client,
	EmbedBuilder,
	type InteractionEditReplyOptions,
	type InteractionReplyOptions,
} from 'discord.js';
import { QueueRecoveryService } from '../utils/QueueRecoveryService';
import deleteOpusCacheEntry from '../utils/deleteOpusCacheEntry';
import enqueueTracks from '../utils/enqueueTracks';
import getEnvironmentVariable from '../utils/getEnvironmentVariable';
import isObject from '../utils/isObject';
import logger from '../utils/logger';

const FATAL_ERROR_MESSAGE_DEBOUNCE = 1000 * 30; // 30 seconds

const botDebugChannelId = getEnvironmentVariable('BOT_DEBUG_CHANNEL_ID');

const server = createServer();

server.listen(8000);

export default function useDebugListeners(client: Client<boolean>) {
	const reportUnhandledError = initializeUnhandledErrorReporter(client, server);

	process.on('unhandledRejection', reportUnhandledError);
	process.on('uncaughtException', reportUnhandledError);

	client.on('error', (error) => {
		logger.error(error, 'Client error');
		captureException(error);
	});

	const player = useMainPlayer();
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
		logger.error(payload, 'Uncaught exception/rejection');
		captureException(payload);

		const channel = client.channels.cache.get(botDebugChannelId);

		if (
			channel?.isSendable() &&
			getEnvironmentVariable('NODE_ENV') !== 'development' &&
			Date.now() - previousMessageTimestamp > FATAL_ERROR_MESSAGE_DEBOUNCE
		) {
			previousMessageTimestamp = Date.now();

			await channel.send(
				'☠️ Encountered a fatal error, the bot will restart promptly – consider using `/recover` afterward.',
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

		const sentryId = captureException(error);

		const debugChannel = client.channels.cache.get(botDebugChannelId);

		if (!debugChannel?.isSendable()) {
			return;
		}

		const embed = new EmbedBuilder()
			.setTitle('Player error')
			.setDescription('Attempting to recover…')
			.setColor('Red')
			.setFields([
				{
					name: 'Sentry Issue ID',
					value: sentryId ? `\`${sentryId}\`` : 'unavailable',
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
				void deleteOpusCacheEntry(track.url);
			}

			if (!queue.channel) {
				embed.setDescription(
					'🛑 Unable to recover – the queue has no voice channel associated with it.\n\nTip: try using the `/recover` command directly.',
				);
				return message.edit({ embeds: [embed] });
			}

			const queueRecoveryService = QueueRecoveryService.getInstance();

			if (!queueRecoveryService) {
				embed.setDescription(
					'🛑 Unable to recover – queue recovery service unavailable.',
				);
				return message.edit({ embeds: [embed] });
			}

			const { tracks, progress } =
				await queueRecoveryService.getContents(player);

			if (tracks.length === 0) {
				queue.delete();

				embed.setDescription('🛑 Found nothing to recover.');
				return message.edit({ embeds: [embed] });
			}

			const originalChannel = queue.metadata?.interaction?.channel;

			if (!originalChannel) {
				embed.setDescription(
					'🛑 Unable to recover – original channel not found.\n\nTip: try using the `/recover` command directly.',
				);
				return message.edit({ embeds: [embed] });
			}

			const messageEditHandler = (
				options: InteractionEditReplyOptions | InteractionReplyOptions,
			) => {
				const { flags, ...messageOptions } = options;

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

			embed.setDescription('✅Recovery successful');
			await message.edit({ embeds: [embed] });
		} catch (error) {
			if (!(error instanceof Error)) {
				return;
			}

			embed.setDescription(`❌ Recovery failed: ${error.message}`);

			await message.edit({ embeds: [embed] });
		}
	};
}
