import type { ChatInputCommandInteraction } from 'discord.js';
import { beforeEach, expect, it, vi } from 'vitest';
import LockdownManager from '../lockdown.ts';

const HOME_GUILD_ID = 'home-guild';
const OTHER_GUILD_ID = 'other-guild';

vi.mock('../getGuildConfig', () => ({
	default: vi.fn((guildId: string | null) => {
		if (guildId === 'home-guild') {
			return {
				playlistsChannelId: 'home-playlists',
				ownerRoleId: 'owner-role-123',
			};
		}
		if (guildId === 'ownerless-guild') {
			return { playlistsChannelId: 'ownerless-playlists' };
		}
		if (guildId === 'other-guild') {
			return {
				playlistsChannelId: 'other-playlists',
				ownerRoleId: 'other-owner-role',
			};
		}
		return null;
	}),
}));

function createMockInteraction(
	commandName: string,
	roles: string[],
	guildId: string | null = HOME_GUILD_ID,
): ChatInputCommandInteraction {
	return {
		commandName,
		guildId,
		client: {},
		member: {
			roles,
		},
		reply: vi.fn().mockResolvedValue({}),
	} as unknown as ChatInputCommandInteraction;
}

beforeEach(() => {
	LockdownManager.getInstance().resetState();

	vi.clearAllMocks();
});

it('should correctly identify owner by role', () => {
	const lockdown = LockdownManager.getInstance();
	const ownerMember = { roles: ['owner-role-123'] };
	const regularMember = { roles: ['other-role'] };
	expect(lockdown.isOwner(ownerMember as never, HOME_GUILD_ID)).toBe(true);
	expect(lockdown.isOwner(regularMember as never, HOME_GUILD_ID)).toBe(false);
});

it('should use the owner role of the given guild', () => {
	const lockdown = LockdownManager.getInstance();
	const homeOwner = { roles: ['owner-role-123'] };
	const otherOwner = { roles: ['other-owner-role'] };

	expect(lockdown.isOwner(homeOwner as never, OTHER_GUILD_ID)).toBe(false);
	expect(lockdown.isOwner(otherOwner as never, OTHER_GUILD_ID)).toBe(true);
});

it('should not treat anyone as owner in an unconfigured guild', () => {
	const lockdown = LockdownManager.getInstance();
	const member = { roles: ['owner-role-123'] };

	expect(lockdown.isOwner(member as never, 'unknown-guild')).toBe(false);
});

it('should check roles on a `GuildMember` role cache', () => {
	const lockdown = LockdownManager.getInstance();
	const member = {
		roles: { cache: new Map([['owner-role-123', {}]]) },
	};

	expect(lockdown.isOwner(member as never, HOME_GUILD_ID)).toBe(true);
});

it('should manage lockdown state', () => {
	const lockdown = LockdownManager.getInstance();
	expect(lockdown.isEnabled(HOME_GUILD_ID)).toBe(false);
	expect(lockdown.isAnyEnabled()).toBe(false);

	lockdown.setState(HOME_GUILD_ID, true);
	expect(lockdown.isEnabled(HOME_GUILD_ID)).toBe(true);
	expect(lockdown.isAnyEnabled()).toBe(true);

	lockdown.setState(HOME_GUILD_ID, false);
	expect(lockdown.isEnabled(HOME_GUILD_ID)).toBe(false);
	expect(lockdown.isAnyEnabled()).toBe(false);
});

it('should keep lockdown state separate per guild', () => {
	const lockdown = LockdownManager.getInstance();

	lockdown.setState(OTHER_GUILD_ID, true);

	expect(lockdown.isEnabled(OTHER_GUILD_ID)).toBe(true);
	expect(lockdown.isEnabled(HOME_GUILD_ID)).toBe(false);
	expect(lockdown.isEnabled(null)).toBe(false);

	const homeInteraction = createMockInteraction('play', ['other-role']);
	const otherInteraction = createMockInteraction(
		'play',
		['other-role'],
		OTHER_GUILD_ID,
	);

	expect(lockdown.hasCommandPermission(homeInteraction)).toBe(true);
	expect(lockdown.hasCommandPermission(otherInteraction)).toBe(false);
});

it('should identify commands affected by lockdown', () => {
	const lockdown = LockdownManager.getInstance();
	expect(lockdown.isCommandAffected('play')).toBe(true);
	expect(lockdown.isCommandAffected('pause')).toBe(true);
	expect(lockdown.isCommandAffected('help')).toBe(false);
	expect(lockdown.isCommandAffected('avatar')).toBe(false);
});

it('should identify owner-only commands', () => {
	const lockdown = LockdownManager.getInstance();
	expect(lockdown.isOwnerOnlyCommand('lockdown')).toBe(true);
	expect(lockdown.isOwnerOnlyCommand('play')).toBe(false);
});

it('should manage lockdown categories', () => {
	const lockdown = LockdownManager.getInstance();
	const initialCategories = lockdown.getCategories();
	expect(initialCategories).toContain('Music');

	lockdown.addCategory('Utilities');
	expect(lockdown.getCategories()).toContain('Utilities');

	lockdown.removeCategory('Music');
	expect(lockdown.getCategories()).not.toContain('Music');
});

it('should manage owner-only commands', () => {
	const lockdown = LockdownManager.getInstance();
	const initialCommands = lockdown.getOwnerOnlyCommands();
	expect(initialCommands).toEqual(['lockdown']);

	lockdown.addOwnerOnlyCommand('debug');
	expect(lockdown.getOwnerOnlyCommands()).toContain('debug');

	lockdown.removeOwnerOnlyCommand('lockdown');
	expect(lockdown.getOwnerOnlyCommands()).not.toContain('lockdown');
});

it('should allow owner to run any command', () => {
	const lockdown = LockdownManager.getInstance();
	const ownerInteraction = createMockInteraction('play', ['owner-role-123']);

	expect(lockdown.hasCommandPermission(ownerInteraction)).toBe(true);

	lockdown.setState(HOME_GUILD_ID, true);
	expect(lockdown.hasCommandPermission(ownerInteraction)).toBe(true);

	const ownerOnlyInteraction = createMockInteraction('lockdown', [
		'owner-role-123',
	]);

	expect(lockdown.hasCommandPermission(ownerOnlyInteraction)).toBe(true);
});

it('should allow `lockdown` for owners of another guild', () => {
	const lockdown = LockdownManager.getInstance();
	const interaction = createMockInteraction(
		'lockdown',
		['other-owner-role'],
		OTHER_GUILD_ID,
	);

	expect(lockdown.hasCommandPermission(interaction)).toBe(true);
});

it('should handle non-owner permissions correctly without lockdown', () => {
	const lockdown = LockdownManager.getInstance();
	const userInteraction = createMockInteraction('play', ['other-role']);

	expect(lockdown.hasCommandPermission(userInteraction)).toBe(true);

	const ownerOnlyInteraction = createMockInteraction('lockdown', [
		'other-role',
	]);
	expect(lockdown.hasCommandPermission(ownerOnlyInteraction)).toBe(false);
});

it('should handle non-owner permissions correctly with lockdown', () => {
	const lockdown = LockdownManager.getInstance();
	lockdown.setState(HOME_GUILD_ID, true);

	const musicInteraction = createMockInteraction('play', ['other-role']);
	const nonMusicInteraction = createMockInteraction('help', ['other-role']);

	expect(lockdown.hasCommandPermission(musicInteraction)).toBe(false);

	expect(lockdown.hasCommandPermission(nonMusicInteraction)).toBe(true);
});

it('should handle missing member', () => {
	const lockdown = LockdownManager.getInstance();
	const interactionWithoutMember = {
		commandName: 'play',
		guildId: HOME_GUILD_ID,
		member: null,
	} as unknown as ChatInputCommandInteraction;

	expect(lockdown.hasCommandPermission(interactionWithoutMember)).toBe(false);
});

it('should send appropriate permission denied messages', async () => {
	const lockdown = LockdownManager.getInstance();
	const ownerOnlyInteraction = createMockInteraction('lockdown', [
		'other-role',
	]);

	await lockdown.sendPermissionDeniedMessage(ownerOnlyInteraction);

	expect(ownerOnlyInteraction.reply).toHaveBeenCalledWith({
		content: 'This command is restricted to <@&owner-role-123>.',
		flags: ['Ephemeral'],
	});

	lockdown.setState(HOME_GUILD_ID, true);
	const lockdownInteraction = createMockInteraction('play', ['other-role']);
	await lockdown.sendPermissionDeniedMessage(lockdownInteraction);

	expect(lockdownInteraction.reply).toHaveBeenCalledWith({
		content:
			'🔒 This command is currently locked down. Only <@&owner-role-123> can use it during lockdown mode.',
		flags: ['Ephemeral'],
	});

	const otherInteraction = createMockInteraction(
		'debug',
		['other-role'],
		OTHER_GUILD_ID,
	);
	await lockdown.sendPermissionDeniedMessage(otherInteraction);

	expect(otherInteraction.reply).toHaveBeenCalledWith({
		content: 'This command is restricted to <@&other-owner-role>.',
		flags: ['Ephemeral'],
	});
});

it('should explain that owner-only commands are unavailable without an owner role', async () => {
	const lockdown = LockdownManager.getInstance();
	const interaction = createMockInteraction('lockdown', [], 'ownerless-guild');

	expect(lockdown.hasCommandPermission(interaction)).toBe(false);

	await lockdown.sendPermissionDeniedMessage(interaction);

	expect(interaction.reply).toHaveBeenCalledWith({
		content: 'This command is not available in this server.',
		flags: ['Ephemeral'],
	});
});

it('should keep non-owner commands available without an owner role', () => {
	const lockdown = LockdownManager.getInstance();
	const interaction = createMockInteraction('play', [], 'ownerless-guild');

	expect(lockdown.hasCommandPermission(interaction)).toBe(true);
});
