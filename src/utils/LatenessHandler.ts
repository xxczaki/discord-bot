import { differenceInCalendarDays } from 'date-fns';
import { ulid } from 'ulid';
import redis from './redis';

export class LatenessHandler {
	static #instance: LatenessHandler;

	private constructor() {}

	static getInstance(): LatenessHandler {
		if (!LatenessHandler.#instance) {
			LatenessHandler.#instance = new LatenessHandler();
		}

		return LatenessHandler.#instance;
	}

	async start(expected: Date) {
		if (await this.isLocked) {
			return;
		}

		await redis.set('discord-player:lateness-lock', expected.toString());
	}

	async end(actual: Date | null) {
		if (!(await this.isLocked)) {
			return;
		}

		const expected = await redis.get('discord-player:lateness-lock');

		if (!expected) {
			return;
		}

		if (actual && differenceInCalendarDays(expected, actual) > 2) {
			await redis.del('discord-player:lateness-lock');
			return;
		}

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

	get isLocked() {
		return redis.exists('discord-player:lateness-lock');
	}

	getStats() {
		return redis.scanStream({
			match: 'discord-player:lateness:*',
			count: 500,
		});
	}
}
