import type { Client } from 'discord.js';
import { getHomeGuildId } from './getGuildConfig';
import logger from './logger';
import reportError from './reportError';
import { StatsHandler } from './StatsHandler';

export default async function migrateLegacyStats(
	client: Client,
): Promise<void> {
	try {
		const homeGuildId = getHomeGuildId(client);

		if (!homeGuildId) {
			return;
		}

		const migratedCount =
			await StatsHandler.getInstance().migrateLegacyStats(homeGuildId);

		if (migratedCount > 0) {
			logger.info(
				{ migratedCount, homeGuildId },
				'Migrated legacy stats to the home guild',
			);
		}
	} catch (error) {
		reportError(error, 'Failed to migrate legacy stats');
	}
}
