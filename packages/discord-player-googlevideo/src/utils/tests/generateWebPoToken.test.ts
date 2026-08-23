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
const { mockBGScriptUrl, mockIntegrityTokenUrl } = vi.hoisted(() => ({
	mockBGScriptUrl: 'https://bgscripturl.example.com',
	mockIntegrityTokenUrl: 'https://example.com/GenerateIT',
}));
const mockBuildURL = vi.hoisted(() =>
	vi.fn().mockReturnValue(mockIntegrityTokenUrl),
);
const mockParseLooseJSON = vi.hoisted(() =>
	vi.fn().mockReturnValue({
		R: {
			bgChallenge: {
				program: 'test-program',
				globalName: 'testGlobal',
				interpreterUrl: {
					privateDoNotAccessOrElseTrustedResourceUrlWrappedValue:
						mockBGScriptUrl.slice(6),
				},
			},
		},
	}),
);

vi.mock('bgutils-js/botguard', () => ({
	BotGuardClient: {
		create: mockBGBotGuardClientCreate,
	},
}));
vi.mock('bgutils-js/webpo', () => ({
	WebPoMinter: {
		create: mockBGWebPoMinterCreate,
	},
}));
vi.mock('bgutils-js/utils', () => ({
	buildURL: mockBuildURL,
	USER_AGENT: 'test-user-agent',
	getHeaders: vi.fn().mockReturnValue([]),
	parseLooseJSON: mockParseLooseJSON,
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

const ytUrl = 'https://www.youtube.com';
const ytConfig = 'ytcfg.set({"test": "config"});';
const ytChallenge = 'window.ytAtN({})';
const fetchResponses = new Map<string, string>();
const mockFetch = vi.fn().mockImplementation((url: string) => {
	if (fetchResponses.has(url)) {
		return {
			text: () => Promise.resolve(fetchResponses.get(url)),
		};
	}

	if (url === ytUrl) {
		return {
			text: () => Promise.resolve(`${ytConfig} ${ytChallenge}`),
		};
	}

	if (url === mockBGScriptUrl) {
		return {
			text: () => Promise.resolve('1+1'),
		};
	}

	if (url === mockIntegrityTokenUrl) {
		return {
			json: () => Promise.resolve(['test-token', 42, 5, 'fallback-token']),
		};
	}

	return {
		text: () => Promise.resolve(''),
		json: () => Promise.resolve(''),
	};
});

global.fetch = mockFetch;

beforeEach(() => {
	fetchResponses.clear();
	vi.clearAllMocks();
});

describe('generateWebPoToken', () => {
	const setFetchResponse = (url: string, response: string) => {
		fetchResponses.set(url, response);
	};

	it('should throw error when video ID is empty', async () => {
		await expect(generateWebPoToken('')).rejects.toThrow(
			'Video ID required for PO token generation',
		);
	});

	it('should throw error when attestation challenge definition is missing from the site HTML', async () => {
		setFetchResponse(ytUrl, `${ytConfig}`);

		await expect(generateWebPoToken('test-video-id')).rejects.toThrow(
			'Could not find challenge in page HTML',
		);
	});

	it('should throw error when bgChallenge is missing in the parsed challenge object', async () => {
		mockParseLooseJSON.mockReturnValueOnce({
			R: {},
		});

		await expect(generateWebPoToken('test-video-id')).rejects.toThrow(
			'Could not get attestation challenge',
		);
	});

	it('should throw error when BotGuard script fails to load', async () => {
		setFetchResponse(mockBGScriptUrl, '');

		await expect(generateWebPoToken('test-video-id')).rejects.toThrow(
			'Could not load BotGuard VM',
		);
	});

	it('should generate PO token with valid inputs', async () => {
		mockBGBotGuardClientCreate.mockResolvedValue(mockBotGuardClient);

		mockBGWebPoMinterCreate.mockResolvedValue(mockWebPoMinter);
		mockWebPoMinter.mintAsWebsafeString.mockResolvedValue('generated-po-token');

		const result = await generateWebPoToken('test-video-id');

		expect(result).toBe('generated-po-token');

		expect(mockBGBotGuardClientCreate).toHaveBeenCalledWith({
			program: 'test-program',
			globalName: 'testGlobal',
			globalObject: globalThis,
		});

		expect(mockBGWebPoMinterCreate).toHaveBeenCalledWith(
			{
				integrityToken: 'test-token',
				estimatedTtlSecs: 42,
				mintRefreshThreshold: 5,
				websafeFallbackToken: 'fallback-token',
			},
			[],
		);

		expect(mockWebPoMinter.mintAsWebsafeString).toHaveBeenCalledWith(
			'test-video-id',
		);
	});
});
