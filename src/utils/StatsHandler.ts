import { ulid } from 'ulid';
import redis from './redis';

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
		type: 'play',
		payload: { title: string; author: string; requestedById?: string },
	) {
		await redis.set(
			`discord-player:stats:${type}:${ulid()}`,
			JSON.stringify(payload),
		);
	}

	getStats(type: 'play') {
		return redis.scanStream({
			match: `discord-player:stats:${type}:*`,
			count: 250,
		});
	}
}
