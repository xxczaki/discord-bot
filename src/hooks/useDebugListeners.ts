import { useMainPlayer } from 'discord-player';
import type { Client } from 'discord.js';
import logger from '../utils/logger';

export default function useDebugListeners(client: Client<boolean>) {
	process.on('unhandledRejection', (reason) => {
		logger.error(reason, 'Unhandled promise rejection');
	});
	process.on('uncaughtException', (error) => {
		logger.error(error, 'Uncaught exception');
	});

	client.on('error', (error) => logger.error(error, 'Client error'));

	const player = useMainPlayer();

	player.on('error', (error) => logger.error(error, 'Player error'));
	player.events.on('error', (_, error) => logger.error(error, 'Player error'));
	player.events.on('playerError', (_, error) =>
		logger.error(error, 'Player error'),
	);

	player.on('debug', (message) => logger.debug({}, message));
	player.events.on('debug', (_, message) => logger.debug({}, message));
}
