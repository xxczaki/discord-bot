import { useMainPlayer } from 'discord-player';

export default function useDebugListeners() {
	const player = useMainPlayer();

	player.on('debug', message => console.log(`[Player] ${message}`));
	player.events.on('debug', (queue, message) =>
		console.log(`[${queue.guild.name}: ${queue.guild.id}] ${message}`),
	);

	process.on('unhandledRejection', reason => {
		console.error('Unhandled promise rejection:', reason);
	});

	process.on('uncaughtException', error => {
		console.error('Uncaught exception:', error);
	});
}
