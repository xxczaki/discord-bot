import redis from './redis';

export class LatenessHandler {
	private static instance: LatenessHandler;

	private constructor() {}

	public static getInstance(): LatenessHandler {
		if (!LatenessHandler.instance) {
			LatenessHandler.instance = new LatenessHandler();
		}

		return LatenessHandler.instance;
	}

	public async start(expected: Date) {
		if (await this.isLocked) {
			return;
		}

		await redis.set('discord-player:lateness-lock', expected.toString());
	}

	public async end(actual: Date | null) {
		if (!(await this.isLocked)) {
			return;
		}

		const expected = await redis.get('discord-player:lateness-lock');

		if (!expected) {
			return;
		}

		const { differenceInCalendarDays } = await import(
			'date-fns/differenceInCalendarDays'
		);

		if (actual && differenceInCalendarDays(expected, actual) > 2) {
			await redis.del('discord-player:lateness-lock');
			return;
		}

		const { ulid } = await import('ulid');

		await redis
			.multi()
			.del('discord-player:lateness-lock')
			.set(
				`discord-player:lateness:${ulid()}`,
				JSON.stringify({
					expected,
					actual: actual?.toString() ?? null,
				}),
			)
			.exec();
	}

	public get isLocked() {
		return redis.exists('discord-player:lateness-lock');
	}

	public getStats() {
		return redis.scanStream({
			match: 'discord-player:lateness:*',
			count: 10,
		});
	}
}
