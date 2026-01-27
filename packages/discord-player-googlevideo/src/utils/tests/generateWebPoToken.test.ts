import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateWebPoToken } from '../generateWebPoToken.js';

const mockBotGuardClient = {
	snapshot: vi.fn(),
};

const mockWebPoMinter = {
	mintAsWebsafeString: vi.fn(),
};

const mockBGBotGuardClientCreate = vi.hoisted(() => vi.fn());
const mockBGWebPoMinterCreate = vi.hoisted(() => vi.fn());
const mockBuildURL = vi.hoisted(() => vi.fn());

vi.mock('bgutils-js', () => ({
	BG: {
		BotGuardClient: {
			create: mockBGBotGuardClientCreate,
		},
		WebPoMinter: {
			create: mockBGWebPoMinterCreate,
		},
	},
	buildURL: mockBuildURL,
	GOOG_API_KEY: 'test-api-key',
	USER_AGENT: 'test-user-agent',
}));

const mockInnertubeCreate = vi.hoisted(() => vi.fn());
const mockGetAttestationChallenge = vi.hoisted(() => vi.fn());

vi.mock('youtubei.js', () => ({
	Innertube: {
		create: mockInnertubeCreate,
	},
}));

vi.mock('jsdom', () => {
	return {
		JSDOM: class {
			window = {
				document: {},
				location: {},
				origin: 'https://www.youtube.com/',
				navigator: {},
			};
		},
	};
});

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
	vi.clearAllMocks();
});

describe('generateWebPoToken', () => {
	it('should throw error when video ID is empty', async () => {
		await expect(generateWebPoToken('')).rejects.toThrow(
			'Video ID required for PO token generation',
		);
	});

	it('should throw error when attestation challenge is missing', async () => {
		mockInnertubeCreate.mockResolvedValue({
			session: {
				context: {
					client: {
						visitorData: 'test-visitor-data',
					},
				},
			},
			getAttestationChallenge: mockGetAttestationChallenge,
		});

		mockGetAttestationChallenge.mockResolvedValue({
			bg_challenge: null,
		});

		await expect(generateWebPoToken('test-video-id')).rejects.toThrow(
			'Could not get attestation challenge',
		);
	});

	it('should throw error when BotGuard script fails to load', async () => {
		mockInnertubeCreate.mockResolvedValue({
			session: {
				context: {
					client: {
						visitorData: 'test-visitor-data',
					},
				},
			},
			getAttestationChallenge: mockGetAttestationChallenge,
		});

		mockGetAttestationChallenge.mockResolvedValue({
			bg_challenge: {
				interpreter_url: {
					private_do_not_access_or_else_trusted_resource_url_wrapped_value:
						'//example.com/script.js',
				},
				program: 'test-program',
				global_name: 'test-global',
			},
		});

		mockFetch.mockResolvedValueOnce({
			text: async () => '',
		});

		await expect(generateWebPoToken('test-video-id')).rejects.toThrow(
			'Could not load BotGuard VM',
		);
	});

	it('should throw error when integrity token is invalid', async () => {
		mockInnertubeCreate.mockResolvedValue({
			session: {
				context: {
					client: {
						visitorData: 'test-visitor-data',
					},
				},
			},
			getAttestationChallenge: mockGetAttestationChallenge,
		});

		mockGetAttestationChallenge.mockResolvedValue({
			bg_challenge: {
				interpreter_url: {
					private_do_not_access_or_else_trusted_resource_url_wrapped_value:
						'//example.com/script.js',
				},
				program: 'test-program',
				global_name: 'testGlobal',
			},
		});

		mockFetch
			.mockResolvedValueOnce({
				text: async () => 'function testGlobal() {}',
			})
			.mockResolvedValueOnce({
				json: async () => [123], // Invalid - should be string
			});

		mockBGBotGuardClientCreate.mockResolvedValue(mockBotGuardClient);
		mockBotGuardClient.snapshot.mockResolvedValue('botguard-response');
		mockBuildURL.mockReturnValue('https://example.com/GenerateIT');

		await expect(generateWebPoToken('test-video-id')).rejects.toThrow(
			'Could not get integrity token',
		);
	});

	/* v8 ignore start */
	it('should generate PO token with valid inputs', async () => {
		mockInnertubeCreate.mockResolvedValue({
			session: {
				context: {
					client: {
						visitorData: 'test-visitor-data',
					},
				},
			},
			getAttestationChallenge: mockGetAttestationChallenge,
		});

		mockGetAttestationChallenge.mockResolvedValue({
			bg_challenge: {
				interpreter_url: {
					private_do_not_access_or_else_trusted_resource_url_wrapped_value:
						'//example.com/script.js',
				},
				program: 'test-program',
				global_name: 'testGlobal',
			},
		});

		mockFetch
			.mockResolvedValueOnce({
				text: async () => 'function testGlobal() {}',
			})
			.mockResolvedValueOnce({
				json: async () => ['test-integrity-token'],
			});

		mockBGBotGuardClientCreate.mockResolvedValue(mockBotGuardClient);
		mockBotGuardClient.snapshot.mockResolvedValue('botguard-response');
		mockBuildURL.mockReturnValue('https://example.com/GenerateIT');

		mockBGWebPoMinterCreate.mockResolvedValue(mockWebPoMinter);
		mockWebPoMinter.mintAsWebsafeString.mockResolvedValue('generated-po-token');

		const result = await generateWebPoToken('test-video-id');

		expect(result).toEqual({
			visitorData: 'test-visitor-data',
			poToken: 'generated-po-token',
		});

		expect(mockInnertubeCreate).toHaveBeenCalledWith({
			user_agent: 'test-user-agent',
			enable_session_cache: false,
		});

		expect(mockGetAttestationChallenge).toHaveBeenCalledWith(
			'ENGAGEMENT_TYPE_UNBOUND',
		);

		expect(mockBGBotGuardClientCreate).toHaveBeenCalledWith({
			program: 'test-program',
			globalName: 'testGlobal',
			globalObj: globalThis,
		});

		expect(mockBGWebPoMinterCreate).toHaveBeenCalledWith(
			{ integrityToken: 'test-integrity-token' },
			expect.any(Array),
		);

		expect(mockWebPoMinter.mintAsWebsafeString).toHaveBeenCalledWith(
			'test-video-id',
		);
	});
	/* v8 ignore end */
});
