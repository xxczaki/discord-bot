import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import getOpusCacheDirectoryPath from './getOpusCacheDirectoryPath';
import opusCacheIndex from './OpusCacheIndex';
import reportError from './reportError';

const opusCacheDirectory = getOpusCacheDirectoryPath();

export default async function deleteOpusCacheEntry(
	filename: string | undefined,
) {
	if (!filename) {
		return;
	}

	const filePath = join(opusCacheDirectory, filename);

	try {
		await unlink(filePath);
		opusCacheIndex.removeEntry(filename);
	} catch (error) {
		if (error instanceof Error && error.message.includes('ENOENT')) {
			return;
		}

		reportError(error, 'Failed to delete Opus cache entry');
	}
}
