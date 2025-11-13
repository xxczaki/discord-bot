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
		type: 'play' | 'playlist',
		payload:
			| { title: string; author: string; requestedById?: string }
			| { playlistId: string; requestedById: string },
	) {
		await redis.set(
			`discord-player:stats:${type}:${ulid()}`,
			JSON.stringify(payload),
		);
	}

	getStats(type: 'play' | 'playlist') {
		return redis.scanStream({
			match: `discord-player:stats:${type}:*`,
			count: 1000,
		});
	}
}
