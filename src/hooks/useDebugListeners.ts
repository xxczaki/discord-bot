import { type Server, createServer } from 'node:net';
import { useMainPlayer } from 'discord-player';
import type { Client } from 'discord.js';
import { BOT_CHANNEL_ID } from '../constants/channelIds';
import logger from '../utils/logger';

const server = createServer();

server.listen(8000);

export default function useDebugListeners(client: Client<boolean>) {
	const reportUnhandledError = initializeUnhandledErrorReporter(client, server);

	process.on('unhandledRejection', reportUnhandledError);
	process.on('uncaughtException', reportUnhandledError);

	client.on('error', (error) => logger.error(error, 'Client error'));

	const player = useMainPlayer();
	const reportPlayerError = initializePlayerErrorReporter(client);

	player.on('error', reportPlayerError);
	player.events.on('error', async (_, error) => reportPlayerError(error));
	player.events.on('playerError', async (_, error) => reportPlayerError(error));

	player.on('debug', (message) => logger.debug({}, message));
	player.events.on('debug', (_, message) => logger.debug({}, message));
}

function initializeUnhandledErrorReporter(
	client: Client<boolean>,
	server: Server,
) {
	return async (payload: unknown) => {
		logger.error(payload, 'Uncaught exception/rejection');
		server.close();

		const channel = client.channels.cache.get(BOT_CHANNEL_ID);

		if (channel?.isSendable()) {
			await channel.send(
				'☠️ Encountered a fatal error, the bot will restart promptly – consider using `/recover` afterward.',
			);
		}
	};
}

function initializePlayerErrorReporter(client: Client<boolean>) {
	return async (error: Error) => {
		logger.error(error, 'Player error');

		const channel = client.channels.cache.get(BOT_CHANNEL_ID);

		if (channel?.isSendable()) {
			await channel.send(
				'🛑 Encountered a player error, consider:\n- skipping the current track with `/skip`, or:\n- purging the queue with `/purge`.\n\nTo recover the queue later on, use `/recover`.',
			);
		}
	};
}
