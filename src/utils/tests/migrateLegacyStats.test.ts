import type { Client } from 'discord.js';
import { beforeEach, expect, it, vi } from 'vitest';
import { getHomeGuildId } from '../getGuildConfig';
import logger from '../logger';
import migrateLegacyStats from '../migrateLegacyStats';
import reportError from '../reportError';
import { StatsHandler } from '../StatsHandler';

vi.mock('../getGuildConfig', () => ({
	getHomeGuildId: vi.fn(),
}));

vi.mock('../reportError', () => ({
	default: vi.fn(),
}));

const HOME_GUILD_ID = 'home-guild-id';

const mockedGetHomeGuildId = vi.mocked(getHomeGuildId);
const mockedReportError = vi.mocked(reportError);
const client = {} as Client;

beforeEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

it('should migrate legacy stats to the home guild', async () => {
	mockedGetHomeGuildId.mockReturnValue(HOME_GUILD_ID);
	const migrateSpy = vi
		.spyOn(StatsHandler.getInstance(), 'migrateLegacyStats')
		.mockResolvedValue(3);

	await migrateLegacyStats(client);

	expect(migrateSpy).toHaveBeenCalledWith(HOME_GUILD_ID);
	expect(logger.info).toHaveBeenCalledWith(
		{ migratedCount: 3, homeGuildId: HOME_GUILD_ID },
		'Migrated legacy stats to the home guild',
	);
});

it('should not log when there is nothing to migrate', async () => {
	mockedGetHomeGuildId.mockReturnValue(HOME_GUILD_ID);
	vi.spyOn(StatsHandler.getInstance(), 'migrateLegacyStats').mockResolvedValue(
		0,
	);

	await migrateLegacyStats(client);

	expect(logger.info).not.toHaveBeenCalled();
});

it('should skip migration when the home guild is unknown', async () => {
	mockedGetHomeGuildId.mockReturnValue(null);
	const migrateSpy = vi.spyOn(StatsHandler.getInstance(), 'migrateLegacyStats');

	await migrateLegacyStats(client);

	expect(migrateSpy).not.toHaveBeenCalled();
});

it('should report migration errors', async () => {
	const error = new Error('Redis unavailable');
	mockedGetHomeGuildId.mockReturnValue(HOME_GUILD_ID);
	vi.spyOn(StatsHandler.getInstance(), 'migrateLegacyStats').mockRejectedValue(
		error,
	);

	await migrateLegacyStats(client);

	expect(mockedReportError).toHaveBeenCalledWith(
		error,
		'Failed to migrate legacy stats',
	);
});
