import type { CacheType, ChatInputCommandInteraction } from 'discord.js';
import { OWNER_USER_ID } from '../constants/channelIds';

export default async function flushQueryCacheCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	const userId = interaction.member?.user.id;

	if (userId !== OWNER_USER_ID) {
		return interaction.editReply(
			`Only <@!${OWNER_USER_ID}> is allowed to run this command.`,
		);
	}

	const { default: redis } = await import('../utils/redis');

	const stream = redis.scanStream({
		match: 'discord-player:query-cache:*',
		count: 500,
	});

	await interaction.editReply('Flushing the query cache…');

	let deleted = 0;

	return new Promise((resolve) => {
		stream.on('data', async (keys = []) => {
			stream.pause();

			for (const key of keys) {
				try {
					await redis.del(key);
					deleted++;
				} catch (error) {
					const { default: logger } = await import('../utils/logger');

					logger.error(error);
				}
			}

			stream.resume();
		});

		stream.on('end', async () => {
			await interaction.editReply(
				`✅ Flushed a total of ${deleted} key(s) from the query cache.`,
			);

			resolve(void 'empty');
		});
	});
}
