import redis from './redis';

export class StatsHandler {
	private static instance: StatsHandler;

	private constructor() {}

	public static getInstance(): StatsHandler {
		if (!StatsHandler.instance) {
			StatsHandler.instance = new StatsHandler();
		}

		return StatsHandler.instance;
	}

	public async saveStat(
		type: 'play',
		payload: { title: string; author: string; requestedById?: string },
	) {
		const { ulid } = await import('ulid');

		await redis.set(
			`discord-player:stats:${type}:${ulid()}`,
			JSON.stringify(payload),
		);
	}

	public getStats(type: 'play') {
		return redis.scanStream({
			match: `discord-player:stats:${type}:*`,
			count: 500,
		});
	}
}
