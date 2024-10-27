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

	async saveQueue(
		currentTrack: (TrackJSON & { progress?: number }) | null,
		tracks: Track[],
	) {
		if (!currentTrack) {
			return redis.set('discord-player:queue', JSON.stringify(tracks));
		}

		await redis.set(
			'discord-player:queue',
			JSON.stringify([currentTrack, ...tracks]),
		);
	}

	async deleteQueue() {
		await redis.del('discord-player:queue');
	}

	async getContents() {
		const tracks = await redis.get('discord-player:queue');

		if (!tracks) {
			return [];
		}

		try {
			const parsed = JSON.parse(tracks) as TrackJSON[];

			return parsed;
		} catch (error) {
			return [];
		}
	}
}
