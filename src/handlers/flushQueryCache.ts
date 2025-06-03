import { captureException } from '@sentry/node';
import type { ChatInputCommandInteraction } from 'discord.js';
import logger from '../utils/logger';
import pluralize from '../utils/pluralize';
import redis from '../utils/redis';

export default async function flushQueryCacheCommandHandler(
	interaction: ChatInputCommandInteraction,
) {
	const stream = redis.scanStream({
		match: 'discord-player:query-cache:*',
		count: 500,
	});

	await interaction.reply('Flushing the query cache…');

	let deleted = 0;

	return new Promise((resolve) => {
		stream.on('data', async (keys = []) => {
			stream.pause();

			for (const key of keys) {
				try {
					await redis.del(key);
					deleted++;
				} catch (error) {
					logger.error(error);
					captureException(error);
				}
			}

			stream.resume();
		});

		stream.on('end', async () => {
			await interaction.editReply(
				pluralize(
					'key',
					'keys',
				)`✅ Flushed a total of ${deleted} ${null} from the query cache.`,
			);

			resolve(void 'empty');
		});
	});
}
