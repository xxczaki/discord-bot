import type { Track, TrackJSON } from 'discord-player';
import redis from './redis';

export class QueueRecoveryService {
	static #instance: QueueRecoveryService;

	private constructor() {}

	static getInstance(): QueueRecoveryService {
		if (!QueueRecoveryService.#instance) {
			QueueRecoveryService.#instance = new QueueRecoveryService();
		}

		return QueueRecoveryService.#instance;
	}

	async saveQueue(tracks: Track[]) {
		await redis.set('discord-player:queue', JSON.stringify(tracks));
	}

	async deleteQueue() {
		await redis.del('discord-player:queue');
	}

	async getNumberOfTracks() {
		const tracks = await redis.get('discord-player:queue');

		if (!tracks) {
			return 0;
		}

		try {
			const parsed = JSON.parse(tracks) as TrackJSON[];

			return parsed.length;
		} catch (error) {
			return 0;
		}
	}

	get isRecoverable() {
		return redis.exists('discord-player:queue');
	}
}
