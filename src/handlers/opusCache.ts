import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { captureException } from '@sentry/node';
import type { CacheType, ChatInputCommandInteraction } from 'discord.js';
import prettyBytes from 'pretty-bytes';
import getOpusCacheDirectoryPath from '../utils/getOpusCacheDirectoryPath';
import logger from '../utils/logger';
import pluralize from '../utils/pluralize';

const opusCacheDirectory = getOpusCacheDirectoryPath();

export default async function opusCacheCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	await interaction.reply('Fetching the details about the cache…');

	try {
		const files = await readdir(opusCacheDirectory);

		const stats = files.map((file) => stat(join(opusCacheDirectory, file)));
		const sizes = await Promise.all(stats);
		const totalSize = sizes.reduce(
			(accumulator, { size }) => accumulator + size,
			0,
		);

		await interaction.editReply(
			pluralize(
				'file',
				'files',
			)`Currently storing ${files.length} cached [Opus](<https://opus-codec.org/>) ${null} (total: ${prettyBytes(totalSize)}).`,
		);
	} catch (error) {
		logger.error(error);
		captureException(error);

		await interaction.editReply(
			'❌ Something went wrong when trying to read the cache directory.',
		);
	}
}
