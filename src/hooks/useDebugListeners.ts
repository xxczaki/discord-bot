import { useMainPlayer } from 'discord-player';
import logger from '../utils/logger';

export default function useDebugListeners() {
	const player = useMainPlayer();

	player.on('debug', (message) => logger.debug(`[Player] ${message}`));
	player.events.on('debug', (queue, message) =>
		logger.debug(`[${queue.guild.name}: ${queue.guild.id}] ${message}`),
	);

	player.on('error', async (error) => {
		logger.error(error, 'Player error');
	});
	player.events.on('error', (_, error) => {
		logger.error(error, 'Player error');
	});
	player.events.on('playerError', (_, error) => {
		logger.error(error, 'Player error');
	});

	process.on('unhandledRejection', (reason) => {
		logger.error(reason, 'Unhandled promise rejection:');
	});
	process.on('uncaughtException', (error) => {
		logger.error(error, 'Uncaught exception:');
	});
}
