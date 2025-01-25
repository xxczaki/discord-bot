import type { CacheType, ChatInputCommandInteraction } from 'discord.js';
import getEnvironmentVariable from '../utils/getEnvironmentVariable';
import logger from '../utils/logger';
import redis from '../utils/redis';

const ownerUserid = getEnvironmentVariable('OWNER_USER_ID');

export default async function flushQueryCacheCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	const userId = interaction.member?.user.id;

	if (userId !== ownerUserid) {
		return interaction.reply(
			`Only <@!${ownerUserid}> is allowed to run this command.`,
		);
	}

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
