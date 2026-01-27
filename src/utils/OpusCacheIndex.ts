import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import Fuse from 'fuse.js';
import getOpusCacheDirectoryPath from './getOpusCacheDirectoryPath';
import logger from './logger';
import parseOpusCacheFilename from './parseOpusCacheFilename';

export interface CacheEntry {
	filename: string;
	title: string;
	author: string;
	durationSeconds: number | null;
}

import { transliterate } from 'transliteration';

const FUSE_THRESHOLD = 0.3;
const DURATION_TOLERANCE_SECONDS = 5;

function normalizeForSearch(input: string): string {
	return transliterate(input).toLowerCase();
}

class OpusCacheIndex {
	#entries: CacheEntry[] = [];
	#fuse: Fuse<CacheEntry> | null = null;
	#cacheDirectory: string;

	constructor() {
		this.#cacheDirectory = getOpusCacheDirectoryPath();
	}

	async initialize(): Promise<void> {
		try {
			const files = await readdir(this.#cacheDirectory);
			const opusFiles = files.filter((file) => file.endsWith('.opus'));

			for (const filename of opusFiles) {
				const parsed = parseOpusCacheFilename(filename);

				if (parsed) {
					this.#entries.push({
						filename,
						title: parsed.title,
						author: parsed.author,
						durationSeconds: parsed.durationSeconds,
					});
				}
			}

			this.#rebuildFuseIndex();

			logger.info(
				{ entryCount: this.#entries.length },
				'Opus cache index initialized',
			);
		} catch (error) {
			logger.error(error, 'Failed to initialize opus cache index');
		}
	}

	#rebuildFuseIndex(): void {
		this.#fuse = new Fuse(this.#entries, {
			keys: [
				{ name: 'title', weight: 0.7 },
				{ name: 'author', weight: 0.3 },
			],
			threshold: FUSE_THRESHOLD,
			includeScore: true,
		});
	}

	findMatch(
		title: string,
		author: string,
		durationSeconds: number,
	): CacheEntry | null {
		if (!this.#fuse || this.#entries.length === 0) {
			return null;
		}

		const searchQuery = normalizeForSearch(`${title} ${author}`);
		const results = this.#fuse.search(searchQuery);

		for (const result of results) {
			const entry = result.item;

			if (entry.durationSeconds === null && durationSeconds === 0) {
				return entry;
			}

			if (entry.durationSeconds === null) {
				continue;
			}

			const durationDiff = Math.abs(entry.durationSeconds - durationSeconds);

			if (durationDiff <= DURATION_TOLERANCE_SECONDS) {
				return entry;
			}
		}

		return null;
	}

	addEntry(entry: CacheEntry): void {
		const existingIndex = this.#entries.findIndex(
			(existing) => existing.filename === entry.filename,
		);

		if (existingIndex !== -1) {
			this.#entries[existingIndex] = entry;
		} else {
			this.#entries.push(entry);
		}

		this.#rebuildFuseIndex();
	}

	removeEntry(filename: string): void {
		const index = this.#entries.findIndex(
			(entry) => entry.filename === filename,
		);

		if (index !== -1) {
			this.#entries.splice(index, 1);
			this.#rebuildFuseIndex();
		}
	}

	getFilePath(filename: string): string {
		return join(this.#cacheDirectory, filename);
	}

	get entryCount(): number {
		return this.#entries.length;
	}
}

const opusCacheIndex = new OpusCacheIndex();

export default opusCacheIndex;
