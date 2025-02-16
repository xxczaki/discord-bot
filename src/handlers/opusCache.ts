import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { captureException } from '@sentry/node';
import type { CacheType, ChatInputCommandInteraction } from 'discord.js';
import prettyBytes from 'pretty-bytes';
import getEnvironmentVariable from '../utils/getEnvironmentVariable';
import logger from '../utils/logger';
import pluralize from '../utils/pluralize';

const ownerUserid = getEnvironmentVariable('OWNER_USER_ID');

export default async function opusCacheCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	const userId = interaction.member?.user.id;

	if (userId !== ownerUserid) {
		return interaction.reply({
			content: `Only <@!${ownerUserid}> is allowed to run this command.`,
			flags: ['Ephemeral'],
		});
	}

	await interaction.reply('Fetching the details about the cache…');

	try {
		const files = await readdir('/opus-cache');

		const stats = files.map((file) => stat(join('/opus-cache', file)));
		const sizes = await Promise.all(stats);
		const totalSize = sizes.reduce(
			(accumulator, { size }) => accumulator + size,
			0,
		);

		await interaction.editReply(
			pluralize(
				'file',
				'files',
			)`Currently storing ${files.length} cached [Opus](https://opus-codec.org/) ${null} (total: ${prettyBytes(totalSize)}).`,
		);
	} catch (error) {
		logger.error(error);
		captureException(error);

		await interaction.editReply(
			'🛑 Something went wrong when trying to read the cache directory.',
		);
	}
}
