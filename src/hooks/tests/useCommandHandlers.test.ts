import type { ChatInputCommandInteraction } from 'discord.js';
import { beforeEach, expect, it, vi } from 'vitest';
import logger from '../../utils/logger';
import useCommandHandlers from '../useCommandHandlers';

const mockJoin = vi.hoisted(() => vi.fn());

vi.mock('node:path', () => ({
	join: mockJoin,
}));

const mockedLogger = vi.mocked(logger);

beforeEach(() => {
	vi.clearAllMocks();
	mockJoin.mockImplementation((...args) => args.join('/'));
});

function createMockInteraction(
	commandName: string,
): ChatInputCommandInteraction {
	return {
		commandName,
	} as ChatInputCommandInteraction;
}

it('should validate command against `RAW_COMMANDS` before proceeding', async () => {
	const validInteraction = createMockInteraction('play');

	await expect(useCommandHandlers(validInteraction)).rejects.toThrow();

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

		await expect(useCommandHandlers(interaction)).rejects.toThrow();

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
