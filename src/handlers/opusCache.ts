import { opendir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { captureException } from '@sentry/node';
import type { ChatInputCommandInteraction } from 'discord.js';
import prettyBytes from 'pretty-bytes';
import getOpusCacheDirectoryPath from '../utils/getOpusCacheDirectoryPath';
import logger from '../utils/logger';
import pluralize from '../utils/pluralize';

const opusCacheDirectory = getOpusCacheDirectoryPath();
const BATCH_SIZE = 100;

export default async function opusCacheCommandHandler(
	interaction: ChatInputCommandInteraction,
) {
	await interaction.reply('Scanning cache directory…');

	try {
		const directory = await opendir(opusCacheDirectory);

		let processedFiles = 0;
		let totalSize = 0;
		let batch: string[] = [];

		const startTime = Date.now();

		let hasAnyFiles = false;

		for await (const entry of directory) {
			if (!entry.isFile()) {
				continue;
			}

			hasAnyFiles = true;
			batch.push(entry.name);

			if (batch.length >= BATCH_SIZE) {
				totalSize = await processBatch(
					batch,
					processedFiles,
					totalSize,
					startTime,
					interaction,
				);

				processedFiles += batch.length;
				batch = [];
			}
		}

		if (batch.length > 0) {
			totalSize = await processBatch(
				batch,
				processedFiles,
				totalSize,
				startTime,
				interaction,
			);
			processedFiles += batch.length;
		}

		if (!hasAnyFiles) {
			await interaction.editReply(
				'Currently storing 0 cached [Opus](<https://opus-codec.org/>) files (total: 0 B).',
			);
			return;
		}

		// Final message with totals
		await interaction.editReply(
			pluralize(
				'file',
				'files',
			)`Currently storing ${processedFiles} cached [Opus](<https://opus-codec.org/>) ${null} (total: ${prettyBytes(totalSize)}).`,
		);
	} catch (error) {
		logger.error(error);
		captureException(error);

		await interaction.editReply(
			'❌ Something went wrong when trying to read the cache directory.',
		);
	}
}

async function processBatch(
	batch: string[],
	processedFiles: number,
	currentTotalSize: number,
	startTime: number,
	interaction: ChatInputCommandInteraction,
): Promise<number> {
	try {
		const batchStats = await Promise.all(
			batch.map((file) => stat(join(opusCacheDirectory, file))),
		);

		const batchSize = batchStats.reduce(
			(accumulator, { size }) => accumulator + size,
			0,
		);

		const newTotalSize = currentTotalSize + batchSize;
		const newProcessedFiles = processedFiles + batch.length;

		const elapsed = Date.now() - startTime;
		const rate = newProcessedFiles / (elapsed / 1000);

		const progressMessage = `Analyzing cache… ${newProcessedFiles} files processed\nCurrent size: ${prettyBytes(newTotalSize)}${rate > 1 ? ` • Rate: ${Math.round(rate)} files/sec` : ''}`;

		await interaction.editReply(progressMessage);

		await new Promise((resolve) => setTimeout(resolve, 100));

		return newTotalSize;
	} catch (batchError) {
		logger.error(
			`Error processing batch of ${batch.length} files:`,
			batchError,
		);

		const newProcessedFiles = processedFiles + batch.length;
		const progressMessage = `Analyzing cache… ${newProcessedFiles} files processed (some with errors)\nCurrent size: ${prettyBytes(currentTotalSize)}`;

		await interaction.editReply(progressMessage);

		await new Promise((resolve) => setTimeout(resolve, 100));

		return currentTotalSize;
	}
}
