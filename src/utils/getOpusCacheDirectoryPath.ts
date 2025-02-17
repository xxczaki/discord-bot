import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import getEnvironmentVariable from './getEnvironmentVariable';
import logger from './logger';

export default function getOpusCacheDirectoryPath() {
	if (getEnvironmentVariable('NODE_ENV') !== 'development') {
		return '/opus-cache';
	}

	const directory = join(import.meta.dirname, 'opus-cache');

	if (!existsSync(directory)) {
		mkdirSync(directory);
		logger.info(`Initialized a development-only Opus cache at ${directory}.`);
	}

	return directory;
}
