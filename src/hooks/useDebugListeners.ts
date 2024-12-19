import { createServer } from 'node:net';
import { useMainPlayer, useQueue } from 'discord-player';
import type { Client } from 'discord.js';
import { BOT_CHANNEL_ID } from '../constants/channelIds';
import logger from '../utils/logger';

const server = createServer();

server.listen(8000);

export default function useDebugListeners(client: Client<boolean>) {
	process.on('unhandledRejection', (reason) => {
		logger.error(reason, 'Unhandled promise rejection');
		server.close();
	});
	process.on('uncaughtException', (error) => {
		logger.error(error, 'Uncaught exception');
		server.close();
	});

	client.on('error', (error) => logger.error(error, 'Client error'));

	const player = useMainPlayer();
	const reportPlayerError = initializePlayerErrorReporter(client);

	player.on('error', reportPlayerError);
	player.events.on('error', async (_, error) => reportPlayerError(error));
	player.events.on('playerError', async (_, error) => reportPlayerError(error));

	player.on('debug', (message) => logger.debug({}, message));
	player.events.on('debug', (_, message) => logger.debug({}, message));
}

function initializePlayerErrorReporter(client: Client<boolean>) {
	return async (error: Error) => {
		logger.error(error, 'Player error');

		const channel = client.channels.cache.get(BOT_CHANNEL_ID);
		const queue = useQueue(client.guilds.cache.at(0)?.id ?? '');

		if (channel?.isSendable()) {
			await channel.send(
				'🛑 Encountered a player error, purging the queue now.\n\nUse `/recover` if needed.',
			);
			queue?.delete();
		}
	};
}
