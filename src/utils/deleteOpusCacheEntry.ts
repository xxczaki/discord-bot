import { unlink } from 'node:fs/promises';
import { captureException } from '@sentry/node';
import getOpusCacheTrackPath from './getOpusCacheTrackPath';
import logger from './logger';

export default async function deleteOpusCacheEntry(url: string | undefined) {
	if (!url) {
		return;
	}

	const filePath = getOpusCacheTrackPath(url);

	try {
		await unlink(filePath);
	} catch (error) {
		if (error instanceof Error && error.message.includes('ENOENT')) {
			logger.warn("Cannot delete an Opus cache entry since it doesn't exist");
			return;
		}

		logger.error(error);
		captureException(error);
	}
}
