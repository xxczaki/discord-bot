import { existsSync, mkdirSync } from 'node:fs';
import { readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import Fuse from 'fuse.js';
import { transliterate } from 'transliteration';
import getEnvironmentVariable from './getEnvironmentVariable';
import logger from './logger';
import reportError from './reportError';
import sanitizeForFilename from './sanitizeForFilename';

export interface CacheEntry {
	filename: string;
	title: string;
	author: string;
	durationSeconds: number | null;
}

interface ParsedCacheFilename {
	title: string;
	author: string;
	durationSeconds: number | null;
}

interface VerifyMatchOptions {
	entry: string;
	title: string;
	author: string;
}

export interface TrackMetadata {
	title: string;
	author: string;
	durationMS: number;
}

const FUSE_THRESHOLD = 0.6;
const DURATION_TOLERANCE_SECONDS = 5;
const MAX_TITLE_LENGTH = 100;
const MAX_AUTHOR_LENGTH = 50;

const STOP_WORDS = new Set([
	'the',
	'and',
	'for',
	'from',
	'with',
	'version',
	'remaster',
	'remastered',
	'single',
	'topic',
	'live',
	'official',
	'audio',
	'video',
	'edit',
	'radio',
]);

export class OpusCacheManager {
	static #instance: OpusCacheManager;
	static #directoryPath: string | null = null;

	#entries: CacheEntry[] = [];
	#fuse: Fuse<CacheEntry> | null = null;

	constructor(private cacheDirectory: string) {}

	static getDirectoryPath(): string {
		if (OpusCacheManager.#directoryPath) {
			return OpusCacheManager.#directoryPath;
		}

		if (getEnvironmentVariable('NODE_ENV') !== 'development') {
			OpusCacheManager.#directoryPath = '/opus-cache';
			return OpusCacheManager.#directoryPath;
		}

		const directory = join(import.meta.dirname, 'opus-cache');

		if (!existsSync(directory)) {
			mkdirSync(directory);
			logger.info(`Initialized a development-only Opus cache at ${directory}.`);
		}

		OpusCacheManager.#directoryPath = directory;
		return OpusCacheManager.#directoryPath;
	}

	static initialize(cacheDirectory?: string): OpusCacheManager {
		if (!OpusCacheManager.#instance) {
			const directory = cacheDirectory ?? OpusCacheManager.getDirectoryPath();
			OpusCacheManager.#instance = new OpusCacheManager(directory);
		}

		return OpusCacheManager.#instance;
	}

	static getInstance(): OpusCacheManager {
		if (!OpusCacheManager.#instance) {
			throw new Error('OpusCacheManager not initialized');
		}

		return OpusCacheManager.#instance;
	}

	async scan(): Promise<void> {
		try {
			const files = await readdir(this.cacheDirectory);
			const opusFiles = files.filter((file) => file.endsWith('.opus'));

			for (const filename of opusFiles) {
				const parsed = this.#parseFilename(filename);

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

		const searchQuery = this.#normalizeForSearch(`${title} ${author}`);
		const results = this.#fuse.search(searchQuery);

		for (const result of results) {
			const entry = result.item;

			if (!this.#verifyMatch({ entry: entry.title, title, author })) {
				continue;
			}

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

	async deleteEntry(filename: string | undefined): Promise<void> {
		if (!filename) {
			return;
		}

		const filePath = this.getFilePath(filename);

		try {
			await unlink(filePath);
			this.removeEntry(filename);
		} catch (error) {
			if (error instanceof Error && error.message.includes('ENOENT')) {
				return;
			}

			reportError(error, 'Failed to delete Opus cache entry');
		}
	}

	getFilePath(filename: string): string {
		return join(this.cacheDirectory, filename);
	}

	generateFilename(metadata: TrackMetadata): string {
		const title = sanitizeForFilename(
			metadata.title || 'unknown_title',
			MAX_TITLE_LENGTH,
		);
		const author = sanitizeForFilename(
			metadata.author || 'unknown_artist',
			MAX_AUTHOR_LENGTH,
		);
		const durationSeconds = Math.round(metadata.durationMS / 1000);

		if (durationSeconds === 0) {
			return `${title}_${author}.opus`;
		}

		return `${title}_${author}_${durationSeconds}.opus`;
	}

	get entryCount(): number {
		return this.#entries.length;
	}

	get directory(): string {
		return this.cacheDirectory;
	}

	#normalizeForSearch(input: string): string {
		return transliterate(input).toLowerCase();
	}

	#getSignificantWords(text: string): string[] {
		return this.#normalizeForSearch(text)
			.split(/[\s\-_()]+/)
			.filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
	}

	#verifyMatch({ entry, title, author }: VerifyMatchOptions): boolean {
		const entryNormalized = this.#normalizeForSearch(entry);
		const titleWords = this.#getSignificantWords(title);
		const authorWords = this.#getSignificantWords(author);

		const titleMatches = titleWords.filter((word) =>
			entryNormalized.includes(word),
		).length;
		const authorMatches = authorWords.filter((word) =>
			entryNormalized.includes(word),
		).length;

		return (
			titleMatches >= Math.ceil(titleWords.length / 2) &&
			authorMatches === authorWords.length
		);
	}

	#parseFilename(filename: string): ParsedCacheFilename | null {
		if (!filename.endsWith('.opus')) {
			return null;
		}

		const nameWithoutExtension = filename.slice(0, -5);
		const parts = nameWithoutExtension.split('_');

		if (parts.length < 2) {
			return null;
		}

		const lastPart = parts.at(-1);
		const durationSeconds = lastPart
			? Number.parseInt(lastPart, 10)
			: Number.NaN;
		const hasDuration = !Number.isNaN(durationSeconds);

		if (hasDuration) {
			const textParts = parts.slice(0, -1);
			const combinedText = textParts.join(' ');

			if (!combinedText) {
				return null;
			}

			return { title: combinedText, author: '', durationSeconds };
		}

		const combinedText = parts.join(' ');

		if (!combinedText) {
			return null;
		}

		return { title: combinedText, author: '', durationSeconds: null };
	}
}
