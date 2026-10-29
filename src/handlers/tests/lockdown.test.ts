import type { ChatInputCommandInteraction } from 'discord.js';
import { beforeEach, expect, it, vi } from 'vitest';
import LockdownManager from '../../utils/lockdown';
import { setPresence } from '../../utils/presenceManager';
import lockdownCommandHandler from '../lockdown';

const GUILD_ID = 'guild-123';

vi.mock('../../utils/getGuildConfig', () => ({
	default: vi.fn(() => ({
		playlistsChannelId: 'playlists-channel',
		ownerRoleId: 'owner-role-123',
	})),
}));

vi.mock('../../utils/presenceManager', () => ({
	setPresence: vi.fn(),
}));

function createMockInteraction(
	roles: string[],
	withClient = false,
	guildId: string | null = GUILD_ID,
): ChatInputCommandInteraction {
	const mockClient = withClient ? { id: 'bot-123' } : undefined;

	return {
		guildId,
		member: {
			roles,
		},
		client: mockClient,
		reply: vi.fn().mockResolvedValue({}),
		editReply: vi.fn().mockResolvedValue({}),
	} as unknown as ChatInputCommandInteraction;
}

beforeEach(() => {
	LockdownManager.getInstance().resetState();

	vi.clearAllMocks();
});

it('should enable lockdown when currently disabled', async () => {
	const interaction = createMockInteraction(['owner-role-123']);

	await lockdownCommandHandler(interaction);

	expect(interaction.editReply).toHaveBeenCalledWith({
		content: expect.stringContaining('🔒 **Lockdown mode enabled!**'),
	});
});

it('should disable lockdown when currently enabled', async () => {
	LockdownManager.getInstance().setState(GUILD_ID, true);

	const interaction = createMockInteraction(['owner-role-123']);

	await lockdownCommandHandler(interaction);

	expect(interaction.editReply).toHaveBeenCalledWith({
		content: expect.stringContaining('🔓 **Lockdown mode disabled!**'),
	});
});

it('should include affected categories in response', async () => {
	const interaction = createMockInteraction(['owner-role-123']);

	await lockdownCommandHandler(interaction);

	expect(interaction.editReply).toHaveBeenCalledWith({
		content: expect.stringContaining('**Affected Categories:** Music'),
	});
});

it('should toggle from enabled to disabled', async () => {
	LockdownManager.getInstance().setState(GUILD_ID, true);

	const interaction = createMockInteraction(['owner-role-123']);

	await lockdownCommandHandler(interaction);

	const replyCall = vi.mocked(interaction.editReply).mock.calls[0][0];
	const replyContent =
		typeof replyCall === 'string'
			? replyCall
			: (replyCall as { content: string }).content;
	expect(replyContent).toContain('🔓 **Lockdown mode disabled!**');
	expect(replyContent).toContain('Users can now use the commands again');
});

it('should toggle from disabled to enabled', async () => {
	const interaction = createMockInteraction(['owner-role-123']);

	await lockdownCommandHandler(interaction);

	const replyCall = vi.mocked(interaction.editReply).mock.calls[0][0];
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
	const interaction = createMockInteraction(['other-role']);

	await lockdownCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith({
		content: 'This command is restricted to <@&owner-role-123>.',
		flags: ['Ephemeral'],
	});
});

it('should handle missing member', async () => {
	const interaction = {
		guildId: GUILD_ID,
		member: null,
		reply: vi.fn().mockResolvedValue({}),
		editReply: vi.fn().mockResolvedValue({}),
	} as unknown as ChatInputCommandInteraction;

	await lockdownCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith({
		content: 'This command is restricted to <@&owner-role-123>.',
		flags: ['Ephemeral'],
	});
});

it('should call setPresence when client is available', async () => {
	const interaction = createMockInteraction(['owner-role-123'], true);

	await lockdownCommandHandler(interaction);

	expect(setPresence).toHaveBeenCalledWith(interaction.client);
});

it('should only toggle lockdown for the current guild', async () => {
	const interaction = createMockInteraction(['owner-role-123']);

	await lockdownCommandHandler(interaction);

	const lockdown = LockdownManager.getInstance();
	expect(lockdown.isEnabled(GUILD_ID)).toBe(true);
	expect(lockdown.isEnabled('another-guild')).toBe(false);
});

it('should reject interactions outside of a guild', async () => {
	const interaction = createMockInteraction(['owner-role-123'], false, null);

	await lockdownCommandHandler(interaction);

	expect(interaction.editReply).not.toHaveBeenCalled();
	expect(interaction.reply).toHaveBeenCalledWith({
		content: 'This command is restricted to <@&owner-role-123>.',
		flags: ['Ephemeral'],
	});
});
