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

	player.on('error', async (error) => {
		const { BOT_CHANNEL_ID } = await import('../constants/channelIds');

		const channel = client.channels.cache.get(BOT_CHANNEL_ID);

		if (channel?.isTextBased()) {
			channel.send({
				content: `❌ Player error, possibly fatal – the message is visible below:\n\n\`\`\`${error.message}\`\`\``,
			});
		}

		logger.error(error, 'Player error');
	});
}
