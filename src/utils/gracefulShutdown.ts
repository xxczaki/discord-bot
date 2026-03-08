import type { Server } from 'node:net';
import type { Client } from 'discord.js';
import { useQueue } from 'discord-player';
import getEnvironmentVariable from './getEnvironmentVariable';
import logger from './logger';
import { QueueRecoveryService } from './QueueRecoveryService';
import redis from './redis';

const SHUTDOWN_TIMEOUT_MS = 5000;
const SHUTDOWN_REASON_TTL_SECONDS = 300;

export default function setupGracefulShutdown(
	client: Client,
	server: Server,
): void {
	process.on('SIGTERM', async () => {
		const timeout = setTimeout(() => {
			logger.error('Graceful shutdown timed out, forcing exit');
			process.exit(1);
		}, SHUTDOWN_TIMEOUT_MS);

		try {
			const guild = client.guilds.cache.first();

			if (guild) {
				const queue = useQueue(guild.id);

				if (queue) {
					const queueRecoveryService = QueueRecoveryService.getInstance();
					await queueRecoveryService.saveQueue(queue);
				}
			}

			await redis.set(
				'discord-bot:shutdown-reason',
				'graceful',
				'EX',
				SHUTDOWN_REASON_TTL_SECONDS,
			);

			const channel = client.channels.cache.get(
				getEnvironmentVariable('BOT_DEBUG_CHANNEL_ID'),
			);

			if (channel?.isSendable()) {
				await channel.send('Shutting down gracefully, queue saved.');
			}

			server.close();
			client.destroy();
			clearTimeout(timeout);
			process.exit(0);
		} catch (error) {
			logger.error(error, 'Error during graceful shutdown');
			clearTimeout(timeout);
			process.exit(1);
		}
	});
}
