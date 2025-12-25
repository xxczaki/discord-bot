import type { ChatInputCommandInteraction } from 'discord.js';
import { beforeEach, expect, it, vi } from 'vitest';
import LockdownManager from '../../utils/lockdown';
import logger from '../../utils/logger';
import reportError from '../../utils/reportError';
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

vi.mock('../../utils/reportError');

const mockedLogger = vi.mocked(logger);
const mockedReportError = vi.mocked(reportError);

function createMockInteraction(
	commandName: string,
	overrides?: Record<string, unknown>,
): ChatInputCommandInteraction {
	return {
		commandName,
		member: {
			user: {
				id: 'mock-owner-id',
				username: 'mockuser',
				discriminator: '0000',
				global_name: null,
				avatar: null,
			},
		},
		reply: vi.fn().mockResolvedValue({}),
		replied: false,
		deferred: false,
		...overrides,
	} as unknown as ChatInputCommandInteraction;
}

beforeEach(() => {
	vi.clearAllMocks();
	mockJoin.mockImplementation((...args) => args.join('/'));

	const lockdown = LockdownManager.getInstance();

	lockdown.resetState();
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
])('should handle snake_case to camelCase conversion correctly for `$input` -> `$expected`', async ({
	input,
	expected,
}) => {
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
});

it('should handle lockdown permission denied for owner-only commands', async () => {
	const interaction = createMockInteraction('maintenance', {
		member: {
			user: {
				id: 'non-owner-id',
				username: 'nonowner',
				discriminator: '0000',
				global_name: null,
				avatar: null,
			},
		},
	});

	await useCommandHandlers(interaction);

	expect(interaction.reply).toHaveBeenCalledWith({
		content: 'Only <@!mock-owner-id> is allowed to run this command.',
		flags: ['Ephemeral'],
	});
});

it('should handle lockdown permission denied for locked down commands', async () => {
	const lockdown = LockdownManager.getInstance();

	lockdown.setState(true);

	const interaction = createMockInteraction('play', {
		member: {
			user: {
				id: 'non-owner-id',
				username: 'nonowner',
				discriminator: '0000',
				global_name: null,
				avatar: null,
			},
		},
	});

	await useCommandHandlers(interaction);

	expect(interaction.reply).toHaveBeenCalledWith({
		content:
			'🔒 This command is currently locked down. Only <@!mock-owner-id> can use it during lockdown mode.',
		flags: ['Ephemeral'],
	});
});

it('should handle module import failures', async () => {
	mockJoin.mockReturnValue('/invalid/path/nonexistent.js');

	const interaction = createMockInteraction('play');

	await useCommandHandlers(interaction);

	expect(mockedReportError).toHaveBeenCalledWith(
		expect.any(Object),
		'Failed to handle command "play"',
	);
	expect(interaction.reply).toHaveBeenCalledWith({
		content:
			'Sorry, an error occurred while processing your command. Please try again.',
		flags: ['Ephemeral'],
	});
});

it('should handle interaction reply failures', async () => {
	mockJoin.mockReturnValue('/invalid/path/nonexistent.js');

	const replyError = new Error('Reply failed');
	const interaction = createMockInteraction('play', {
		reply: vi.fn().mockRejectedValue(replyError),
	});

	await useCommandHandlers(interaction);

	expect(mockedLogger.error).toHaveBeenCalledWith(
		replyError,
		'Failed to send error reply to interaction',
	);
});

it('should not attempt reply if interaction already replied', async () => {
	mockJoin.mockReturnValue('/invalid/path/nonexistent.js');

	const interaction = createMockInteraction('play', {
		replied: true,
	});

	await useCommandHandlers(interaction);

	expect(interaction.reply).not.toHaveBeenCalled();
});

it('should not attempt reply if interaction already deferred', async () => {
	mockJoin.mockReturnValue('/invalid/path/nonexistent.js');

	const interaction = createMockInteraction('play', {
		deferred: true,
	});

	await useCommandHandlers(interaction);

	expect(interaction.reply).not.toHaveBeenCalled();
});
