import type { ChatInputCommandInteraction } from 'discord.js';
import { beforeEach, expect, it, vi } from 'vitest';
import LockdownManager from '../../utils/lockdown';
import { setPresence } from '../../utils/presenceManager';
import lockdownCommandHandler from '../lockdown';

vi.mock('../../utils/getEnvironmentVariable', () => ({
	default: vi.fn((key: string) => {
		if (key === 'OWNER_USER_ID') {
			return 'owner-123';
		}
		throw new TypeError(`Environment variable ${key} is not defined`);
	}),
}));

vi.mock('../../utils/presenceManager', () => ({
	setPresence: vi.fn(),
}));

function createMockInteraction(
	userId: string,
	withClient = false,
): ChatInputCommandInteraction {
	const mockClient = withClient ? { id: 'bot-123' } : undefined;

	return {
		member: {
			user: {
				id: userId,
			},
		},
		client: mockClient,
		reply: vi.fn().mockResolvedValue({}),
	} as unknown as ChatInputCommandInteraction;
}

beforeEach(() => {
	LockdownManager.getInstance().resetState();

	vi.clearAllMocks();
});

it('should enable lockdown when currently disabled', async () => {
	const interaction = createMockInteraction('owner-123');

	await lockdownCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith({
		content: expect.stringContaining('🔒 **Lockdown mode enabled!**'),
	});
});

it('should disable lockdown when currently enabled', async () => {
	LockdownManager.getInstance().setState(true);

	const interaction = createMockInteraction('owner-123');

	await lockdownCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith({
		content: expect.stringContaining('🔓 **Lockdown mode disabled!**'),
	});
});

it('should include affected categories in response', async () => {
	const interaction = createMockInteraction('owner-123');

	await lockdownCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith({
		content: expect.stringContaining('**Affected Categories:** Music'),
	});
});

it('should toggle from enabled to disabled', async () => {
	LockdownManager.getInstance().setState(true);

	const interaction = createMockInteraction('owner-123');

	await lockdownCommandHandler(interaction);

	const replyCall = vi.mocked(interaction.reply).mock.calls[0][0];
	const replyContent =
		typeof replyCall === 'string'
			? replyCall
			: (replyCall as { content: string }).content;
	expect(replyContent).toContain('🔓 **Lockdown mode disabled!**');
	expect(replyContent).toContain('Users can now use the commands again');
});

it('should toggle from disabled to enabled', async () => {
	const interaction = createMockInteraction('owner-123');

	await lockdownCommandHandler(interaction);

	const replyCall = vi.mocked(interaction.reply).mock.calls[0][0];
	const replyContent =
		typeof replyCall === 'string'
			? replyCall
			: (replyCall as { content: string }).content;
	expect(replyContent).toContain('🔒 **Lockdown mode enabled!**');
	expect(replyContent).toContain(
		'Certain commands are now restricted to the bot owner only',
	);
});

it('should reject non-owner users', async () => {
	const interaction = createMockInteraction('user-456');

	await lockdownCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith({
		content: 'Only <@!owner-123> is allowed to run this command.',
		flags: ['Ephemeral'],
	});
});

it('should handle missing user ID', async () => {
	const interaction = {
		member: null,
		reply: vi.fn().mockResolvedValue({}),
	} as unknown as ChatInputCommandInteraction;

	await lockdownCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith({
		content: 'Only <@!owner-123> is allowed to run this command.',
		flags: ['Ephemeral'],
	});
});

it('should call setPresence when client is available', async () => {
	const interaction = createMockInteraction('owner-123', true);

	await lockdownCommandHandler(interaction);

	expect(setPresence).toHaveBeenCalledWith(interaction.client);
});
