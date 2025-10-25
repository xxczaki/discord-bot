import { beforeEach, describe, expect, it, vi } from 'vitest';
import { YoutubeSabrExtractor } from '../YoutubeSabrExtractor';

vi.mock('youtubei.js', () => ({
	Innertube: {
		create: vi.fn(),
	},
	Platform: {
		shim: {},
	},
	UniversalCache: vi.fn(),
	YTNodes: {
		NavigationEndpoint: vi.fn(),
	},
	Constants: {
		CLIENT_NAME_IDS: {
			WEB: '1',
		},
	},
}));

vi.mock('googlevideo/sabr-stream', () => ({
	SabrStream: vi.fn(),
}));

vi.mock('googlevideo/utils', () => ({
	buildSabrFormat: vi.fn((format) => format),
	EnabledTrackTypes: {
		AUDIO_ONLY: 1,
	},
}));

const mockPlayer = {
	extractors: {
		register: vi.fn(),
		loadMulti: vi.fn(),
	},
} as never;

describe('YoutubeSabrExtractor', () => {
	let extractor: YoutubeSabrExtractor;

	beforeEach(() => {
		vi.clearAllMocks();
		extractor = new YoutubeSabrExtractor({} as never, mockPlayer);
	});

	describe('validate', () => {
		it('should validate YouTube URLs', async () => {
			expect(
				await extractor.validate('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
			).toBe(true);
			expect(await extractor.validate('https://youtu.be/dQw4w9WgXcQ')).toBe(
				true,
			);
			expect(
				await extractor.validate('https://youtube.com/shorts/dQw4w9WgXcQ'),
			).toBe(true);
		});

		it('should validate YouTube protocol queries', async () => {
			expect(await extractor.validate('youtube:search query')).toBe(true);
			expect(await extractor.validate('ytsearch:search query')).toBe(true);
		});

		it('should reject non-YouTube URLs', async () => {
			expect(await extractor.validate('https://spotify.com/track/123')).toBe(
				false,
			);
			expect(await extractor.validate('https://example.com')).toBe(false);
		});

		it('should reject arbitrary query type', async () => {
			expect(
				await extractor.validate(
					'https://youtube.com/watch?v=123',
					'arbitrary',
				),
			).toBe(false);
		});
	});

	describe('identifier', () => {
		it('should have the correct identifier', () => {
			expect(YoutubeSabrExtractor.identifier).toBe(
				'com.github.xxczaki.youtube-sabr',
			);
		});
	});
});
