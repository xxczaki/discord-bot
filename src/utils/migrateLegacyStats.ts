import type { Client } from 'discord.js';
import { getHomeGuildId } from './getGuildConfig.ts';
import logger from './logger.ts';
import reportError from './reportError.ts';
import { StatsHandler } from './StatsHandler.ts';

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
