import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateWebPoToken } from '../generateWebPoToken.js';

const mockBGChallenge = {
	interpreterJavascript: {
		privateDoNotAccessOrElseSafeScriptWrappedValue: '',
	},
	program: 'test-program',
	globalName: 'test-global',
};

const mockBGCreate = vi.hoisted(() => vi.fn());
const mockBGPoTokenGenerate = vi.hoisted(() => vi.fn());
const mockBGPoTokenGeneratePlaceholder = vi.hoisted(() => vi.fn());

vi.mock('bgutils-js', () => ({
	BG: {
		Challenge: {
			create: mockBGCreate,
		},
		PoToken: {
			generate: mockBGPoTokenGenerate,
			generatePlaceholder: mockBGPoTokenGeneratePlaceholder,
		},
	},
}));

vi.mock('jsdom', () => {
	return {
		JSDOM: class {
			window = {
				document: {},
			};
		},
	};
});

beforeEach(() => {
	vi.clearAllMocks();
});

describe('generateWebPoToken', () => {
	it('should throw error when content binding is empty', async () => {
		await expect(generateWebPoToken('')).rejects.toThrow(
			'Content binding required for PO token generation',
		);
	});

	it('should throw error when BotGuard challenge creation fails', async () => {
		mockBGCreate.mockResolvedValue(null);

		await expect(generateWebPoToken('test-binding')).rejects.toThrow(
			'Failed to create BotGuard challenge',
		);
	});

	it('should throw error when interpreter javascript is missing', async () => {
		mockBGCreate.mockResolvedValue({
			interpreterJavascript: {
				privateDoNotAccessOrElseSafeScriptWrappedValue: '',
			},
			program: 'test-program',
			globalName: 'test-global',
		});

		await expect(generateWebPoToken('test-binding')).rejects.toThrow(
			'Failed to load BotGuard VM',
		);
	});

	/* v8 ignore start */
	it('should generate PO token with valid inputs', async () => {
		mockBGCreate.mockResolvedValue({
			...mockBGChallenge,
			interpreterJavascript: {
				privateDoNotAccessOrElseSafeScriptWrappedValue:
					'var exportedVars = {}; exportedVars.nFunction = function(n) { return n; }; exportedVars.sigFunction = function(sig) { return sig; };',
			},
		});

		mockBGPoTokenGenerate.mockResolvedValue({
			poToken: 'generated-po-token',
		});

		mockBGPoTokenGeneratePlaceholder.mockReturnValue('placeholder-token');

		const result = await generateWebPoToken('test-binding');

		expect(result).toEqual({
			visitorData: 'test-binding',
			placeholderPoToken: 'placeholder-token',
			poToken: 'generated-po-token',
		});

		expect(mockBGCreate).toHaveBeenCalledWith({
			fetch: expect.any(Function),
			globalObj: globalThis,
			identifier: 'test-binding',
			requestKey: 'O43z0dpjhgX20SCx4KAo',
		});

		expect(mockBGPoTokenGenerate).toHaveBeenCalledWith({
			program: 'test-program',
			globalName: 'test-global',
			bgConfig: expect.objectContaining({
				identifier: 'test-binding',
			}),
		});

		expect(mockBGPoTokenGeneratePlaceholder).toHaveBeenCalledWith(
			'test-binding',
		);
	});
	/* v8 ignore end */
});
