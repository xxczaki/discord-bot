import type { Redis } from 'ioredis';

interface ExternalPlaylistMetadata {
	trackCount: number;
	cachedAt: string;
}

export class ExternalPlaylistCache {
	constructor(private redis: Redis) {}

	#createKey(playlistUrl: string) {
		return `external-playlist-cache:${playlistUrl}` as const;
	}

	async setTrackCount(playlistUrl: string, trackCount: number): Promise<void> {
		const metadata: ExternalPlaylistMetadata = {
			trackCount,
			cachedAt: new Date().toISOString(),
		};

		const key = this.#createKey(playlistUrl);
		await this.redis.set(key, JSON.stringify(metadata));
	}

	async getTrackCount(
		playlistUrl: string,
	): Promise<ExternalPlaylistMetadata | null> {
		try {
			const key = this.#createKey(playlistUrl);
			const cached = await this.redis.get(key);

			if (!cached) {
				return null;
			}

			return JSON.parse(cached) as ExternalPlaylistMetadata;
		} catch {
			return null;
		}
	}

	formatCacheDate(isoDate: string): string {
		const date = new Date(isoDate);

		return date.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
		});
	}
}
