import type { ChatInputCommandInteraction } from 'discord.js';
import { beforeEach, expect, it, vi } from 'vitest';
import logger from '../../utils/logger';
import useCommandHandlers from '../useCommandHandlers';

const mockJoin = vi.hoisted(() => vi.fn());

vi.mock('node:path', () => ({
	join: mockJoin,
}));

vi.mock('../../utils/getEnvironmentVariable', () => ({
	default: vi.fn((key: string) => {
		if (key === 'OWNER_USER_ID') {
			return 'mock-owner-id';
		}
		throw new TypeError(`Environment variable ${key} is not defined`);
	}),
}));

const mockedLogger = vi.mocked(logger);

function createMockInteraction(
	commandName: string,
): ChatInputCommandInteraction {
	return {
		commandName,
		member: {
			user: {
				id: 'mock-owner-id',
			},
		},
		reply: vi.fn().mockResolvedValue({}),
		replied: false,
		deferred: false,
	} as unknown as ChatInputCommandInteraction;
}

beforeEach(() => {
	vi.clearAllMocks();
	mockJoin.mockImplementation((...args) => args.join('/'));
});

it('should validate command against `RAW_COMMANDS` before proceeding', async () => {
	const validInteraction = createMockInteraction('play');

	await useCommandHandlers(validInteraction);

	expect(mockedLogger.warn).not.toHaveBeenCalledWith('Unknown command, "play"');

	const invalidInteraction = createMockInteraction('invalid_command');

	await useCommandHandlers(invalidInteraction);

	expect(mockedLogger.warn).toHaveBeenCalledWith(
		'Unknown command, "invalid_command"',
	);
});

it.each([
	{ input: 'tic_tac_toe', expected: 'ticTacToe' },
	{ input: 'help', expected: 'help' },
])(
	'should handle snake_case to camelCase conversion correctly for `$input` -> `$expected`',
	async ({ input, expected }) => {
		const interaction = createMockInteraction(input);

		await useCommandHandlers(interaction);

		expect(mockJoin).toHaveBeenCalledWith(
			expect.any(String),
			'handlers',
			`${expected}.js`,
		);

		expect(mockJoin).toHaveBeenCalledTimes(1);
		const [dirname, folder, filename] = mockJoin.mock.calls[0];
		expect(dirname).toMatch(/hooks$/);
		expect(folder).toBe('handlers');
		expect(filename).toBe(`${expected}.js`);
	},
);
