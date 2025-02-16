import { type Server, createServer } from 'node:net';
import { captureException } from '@sentry/node';
import { type GuildQueue, useMainPlayer } from 'discord-player';
import type { Client } from 'discord.js';
import getEnvironmentVariable from '../utils/getEnvironmentVariable';
import logger from '../utils/logger';

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
	const reportPlayerError = initializePlayerErrorReporter(client);

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
	return async (payload: unknown) => {
		logger.error(payload, 'Uncaught exception/rejection');
		captureException(payload);
		server.close();

		const channel = client.channels.cache.get(botDebugChannelId);

		if (
			channel?.isSendable() &&
			getEnvironmentVariable('NODE_ENV') !== 'development'
		) {
			await channel.send(
				'☠️ Encountered a fatal error, the bot will restart promptly – consider using `/recover` afterward.',
			);
		}
	};
}

function initializePlayerErrorReporter(client: Client<boolean>) {
	return async (queue: GuildQueue | undefined, error: Error) => {
		logger.error(error, 'Player error');
		captureException(error);

		const channel = client.channels.cache.get(botDebugChannelId);

		if (queue) {
			queue.delete();
		}

		if (
			channel?.isSendable() &&
			getEnvironmentVariable('NODE_ENV') !== 'development'
		) {
			await channel.send(
				'🛑 Encountered a player error – use `/recover` to resume the music playback.',
			);
		}
	};
}
