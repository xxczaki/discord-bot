import process from 'node:process';
import { useMainPlayer } from 'discord-player';
import logger from '../utils/logger';

export default function useDebugListeners() {
	const player = useMainPlayer();

	player.on('debug', (message) => logger.debug(`[Player] ${message}`));
	player.events.on('debug', (queue, message) =>
		logger.debug(`[${queue.guild.name}: ${queue.guild.id}] ${message}`),
	);

	player.on('error', (error) => {
		logger.error('Player error', error);
	});
	player.events.on('error', (_, error) => {
		logger.error('Player error', error);
	});
	player.events.on('playerError', (_, error) => {
		logger.error('Player error', error);
	});

	process.on('unhandledRejection', (reason) => {
		logger.error('Unhandled promise rejection:', reason);
	});
	process.on('uncaughtException', (error) => {
		logger.error('Uncaught exception:', error);
	});
}
