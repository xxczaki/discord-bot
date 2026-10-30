import { randomUUIDv7 } from 'node:crypto';
import redis from './redis.ts';

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

		if (
			actual &&
			toPlainDate(actual).until(toPlainDate(new Date(expected))).days > 2
		) {
			await redis.del('discord-player:lateness-lock');
			return;
		}

		await redis
			.multi()
			.del('discord-player:lateness-lock')
			.set(
				`discord-player:lateness:${randomUUIDv7()}`,
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

	getStats(): AsyncIterable<string[]> {
		return redis.scanStream({
			match: 'discord-player:lateness:*',
			count: 500,
		});
	}
}

function toPlainDate(date: Date) {
	return date
		.toTemporalInstant()
		.toZonedDateTimeISO(Temporal.Now.timeZoneId())
		.toPlainDate();
}
