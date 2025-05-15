import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, expect, it, vi } from 'vitest';

import getEnvironmentVariable from '../getEnvironmentVariable';
import getOpusCacheDirectoryPath from '../getOpusCacheDirectoryPath';

vi.mock('../getEnvironmentVariable', () => {
	return {
		default: vi.fn().mockReturnValue('development'),
	};
});

vi.mock('node:fs', () => ({
	existsSync: vi.fn(),
	mkdirSync: vi.fn(),
}));

const mockedDirname = '/Users/xxczaki/dev/discord-bot/src/utils';
vi.stubGlobal('import.meta', { dirname: mockedDirname });

const mockedExistsSync = vi.mocked(existsSync);
const mockedMkdirSync = vi.mocked(mkdirSync);
const mockedGetEnvironmentVariable = vi.mocked(getEnvironmentVariable);

beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
	mockedGetEnvironmentVariable.mockReturnValue('development');
});

it('returns /opus-cache in production environment', () => {
	mockedGetEnvironmentVariable.mockReturnValue('production');

	const result = getOpusCacheDirectoryPath();

	expect(result).toBe('/opus-cache');
	expect(mockedExistsSync).not.toHaveBeenCalled();
	expect(mockedMkdirSync).not.toHaveBeenCalled();
});

it('creates and returns development cache directory when it does not exist', () => {
	mockedExistsSync.mockReturnValue(false);
	const expectedDirectory = join(mockedDirname, 'opus-cache');

	const result = getOpusCacheDirectoryPath();

	expect(result).toBe(expectedDirectory);
	expect(mockedExistsSync).toHaveBeenCalledWith(expectedDirectory);
	expect(mockedMkdirSync).toHaveBeenCalledWith(expectedDirectory);
});

it('returns existing development cache directory without creating it', () => {
	mockedExistsSync.mockReturnValue(true);
	const expectedDirectory = join(mockedDirname, 'opus-cache');

	const result = getOpusCacheDirectoryPath();

	expect(result).toBe(expectedDirectory);
	expect(mockedExistsSync).toHaveBeenCalledWith(expectedDirectory);
	expect(mockedMkdirSync).not.toHaveBeenCalled();
});
