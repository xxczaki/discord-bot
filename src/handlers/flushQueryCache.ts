import type { ChatInputCommandInteraction } from 'discord.js';
import pluralize from '../utils/pluralize';
import redis from '../utils/redis';
import reportError from '../utils/reportError';

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

			if (keys.length > 0) {
				try {
					const pipeline = redis.pipeline();

					for (const key of keys) {
						pipeline.del(key);
					}

					await pipeline.exec();
					deleted += keys.length;
				} catch (error) {
					reportError(error, 'Failed to delete query cache keys from Redis');
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
