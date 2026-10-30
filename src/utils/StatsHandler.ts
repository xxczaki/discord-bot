import { randomUUIDv7 } from 'node:crypto';
import redis from './redis.ts';

type StatType = 'play' | 'playlist';

const STAT_TYPES: StatType[] = ['play', 'playlist'];

export class StatsHandler {
	static #instance: StatsHandler;

	private constructor() {}

	static getInstance(): StatsHandler {
		if (!StatsHandler.#instance) {
			StatsHandler.#instance = new StatsHandler();
		}

		return StatsHandler.#instance;
	}

	async saveStat(
		guildId: string,
		type: StatType,
		payload:
			| { title: string; author: string; requestedById?: string }
			| { playlistId: string; requestedById: string },
	) {
		await redis.set(
			`discord-player:stats:${guildId}:${type}:${randomUUIDv7()}`,
			JSON.stringify(payload),
		);
	}

	getStats(guildId: string, type: StatType): AsyncIterable<string[]> {
		return redis.scanStream({
			match: `discord-player:stats:${guildId}:${type}:*`,
			count: 1000,
		});
	}

	async migrateLegacyStats(guildId: string): Promise<number> {
		let migratedCount = 0;

		for (const type of STAT_TYPES) {
			const legacyPrefix = `discord-player:stats:${type}:`;
			const stream = redis.scanStream({
				match: `${legacyPrefix}*`,
				count: 1000,
			});

			for await (const keys of stream as AsyncIterable<string[]>) {
				if (keys.length === 0) {
					continue;
				}

				const pipeline = redis.pipeline();

				for (const key of keys) {
					pipeline.renamenx(
						key,
						`discord-player:stats:${guildId}:${type}:${key.slice(legacyPrefix.length)}`,
					);
				}

				await pipeline.exec();
				migratedCount += keys.length;
			}
		}

		return migratedCount;
	}
}
