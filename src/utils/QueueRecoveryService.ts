import {
	deserialize,
	type GuildQueue,
	type Player,
	type SerializedTrack,
	serialize,
	type Track,
} from 'discord-player';
import redis from './redis';

const DEFAULT_CONTENTS = {
	tracks: [],
	progress: 0,
	savedAt: null,
};

export class QueueRecoveryService {
	static #instance: QueueRecoveryService;

	private constructor() {}

	static getInstance(): QueueRecoveryService {
		if (!QueueRecoveryService.#instance) {
			QueueRecoveryService.#instance = new QueueRecoveryService();
		}

		return QueueRecoveryService.#instance;
	}

	async saveQueue(queue: GuildQueue<unknown> | null) {
		if (!queue || queue.size === 0) {
			return;
		}

		const tracks = [queue.currentTrack, ...queue.tracks.store]
			.filter(Boolean)
			.map((track) => serialize(track));

		const pipeline = redis.pipeline();

		pipeline.set('queue-recovery:tracks', JSON.stringify(tracks));
		pipeline.set(
			'queue-recovery:progress',
			queue.node.getTimestamp()?.current.value ?? 0,
		);
		pipeline.set('queue-recovery:saved-at', Date.now());

		await pipeline.exec();
	}

	async deleteQueue() {
		const pipeline = redis.pipeline();

		pipeline.del('queue-recovery:tracks');
		pipeline.del('queue-recovery:progress');
		pipeline.del('queue-recovery:saved-at');

		await pipeline.exec();
	}

	async getContents(player: Player) {
		const pipeline = redis.pipeline();

		pipeline.get('queue-recovery:tracks');
		pipeline.get('queue-recovery:progress');
		pipeline.get('queue-recovery:saved-at');

		const result = await pipeline.exec();

		if (!result) {
			return DEFAULT_CONTENTS;
		}

		const [[, tracks], [, progress], [, savedAt]] = result as [
			[error: Error | null, tracks: string | null],
			[error: Error | null, progress: number],
			[error: Error | null, savedAt: string | null],
		];

		if (!tracks) {
			return DEFAULT_CONTENTS;
		}

		try {
			const parsedTracks = JSON.parse(tracks) as SerializedTrack[];

			return {
				tracks: parsedTracks.map((track) =>
					deserialize(player, track),
				) as Track[],
				progress,
				savedAt: savedAt ? Number.parseInt(savedAt, 10) : null,
			};
		} catch {
			return DEFAULT_CONTENTS;
		}
	}
}
