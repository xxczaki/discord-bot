import type { ChatInputCommandInteraction } from 'discord.js';
import { beforeEach, expect, it, vi } from 'vitest';
import LockdownManager from '../lockdown';

vi.mock('../getEnvironmentVariable', () => ({
	default: vi.fn((key: string) => {
		if (key === 'OWNER_ROLE_ID') {
			return 'owner-role-123';
		}
		throw new TypeError(`Environment variable ${key} is not defined`);
	}),
}));

function createMockInteraction(
	commandName: string,
	roles: string[],
): ChatInputCommandInteraction {
	return {
		commandName,
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
	expect(lockdown.isOwner(ownerMember as never)).toBe(true);
	expect(lockdown.isOwner(regularMember as never)).toBe(false);
});

it('should manage lockdown state', () => {
	const lockdown = LockdownManager.getInstance();
	expect(lockdown.isEnabled()).toBe(false);

	lockdown.setState(true);
	expect(lockdown.isEnabled()).toBe(true);

	lockdown.setState(false);
	expect(lockdown.isEnabled()).toBe(false);
});

it('should identify commands affected by lockdown', () => {
	const lockdown = LockdownManager.getInstance();
	expect(lockdown.isCommandAffected('play')).toBe(true); // Music category
	expect(lockdown.isCommandAffected('pause')).toBe(true); // Music category
	expect(lockdown.isCommandAffected('help')).toBe(false); // Other category
	expect(lockdown.isCommandAffected('avatar')).toBe(false); // Utilities category
});

it('should identify owner-only commands', () => {
	const lockdown = LockdownManager.getInstance();
	expect(lockdown.isOwnerOnlyCommand('maintenance')).toBe(true);
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
	expect(initialCommands).toContain('maintenance');

	lockdown.addOwnerOnlyCommand('debug');
	expect(lockdown.getOwnerOnlyCommands()).toContain('debug');

	lockdown.removeOwnerOnlyCommand('maintenance');
	expect(lockdown.getOwnerOnlyCommands()).not.toContain('maintenance');
});

it('should allow owner to run any command', () => {
	const lockdown = LockdownManager.getInstance();
	const ownerInteraction = createMockInteraction('play', ['owner-role-123']);

	expect(lockdown.hasCommandPermission(ownerInteraction)).toBe(true);

	lockdown.setState(true);
	expect(lockdown.hasCommandPermission(ownerInteraction)).toBe(true);

	const ownerOnlyInteraction = createMockInteraction('maintenance', [
		'owner-role-123',
	]);

	expect(lockdown.hasCommandPermission(ownerOnlyInteraction)).toBe(true);
});

it('should handle non-owner permissions correctly without lockdown', () => {
	const lockdown = LockdownManager.getInstance();
	const userInteraction = createMockInteraction('play', ['other-role']);

	expect(lockdown.hasCommandPermission(userInteraction)).toBe(true);

	const ownerOnlyInteraction = createMockInteraction('maintenance', [
		'other-role',
	]);
	expect(lockdown.hasCommandPermission(ownerOnlyInteraction)).toBe(false);
});

it('should handle non-owner permissions correctly with lockdown', () => {
	const lockdown = LockdownManager.getInstance();
	lockdown.setState(true);

	const musicInteraction = createMockInteraction('play', ['other-role']);
	const nonMusicInteraction = createMockInteraction('help', ['other-role']);

	expect(lockdown.hasCommandPermission(musicInteraction)).toBe(false);

	expect(lockdown.hasCommandPermission(nonMusicInteraction)).toBe(true);
});

it('should handle missing member', () => {
	const lockdown = LockdownManager.getInstance();
	const interactionWithoutMember = {
		commandName: 'play',
		member: null,
	} as unknown as ChatInputCommandInteraction;

	expect(lockdown.hasCommandPermission(interactionWithoutMember)).toBe(false);
});

it('should send appropriate permission denied messages', async () => {
	const lockdown = LockdownManager.getInstance();
	const ownerOnlyInteraction = createMockInteraction('maintenance', [
		'other-role',
	]);

	await lockdown.sendPermissionDeniedMessage(ownerOnlyInteraction);

	expect(ownerOnlyInteraction.reply).toHaveBeenCalledWith({
		content: 'This command is restricted to <@&owner-role-123>.',
		flags: ['Ephemeral'],
	});

	lockdown.setState(true);
	const lockdownInteraction = createMockInteraction('play', ['other-role']);
	await lockdown.sendPermissionDeniedMessage(lockdownInteraction);

	expect(lockdownInteraction.reply).toHaveBeenCalledWith({
		content:
			'🔒 This command is currently locked down. Only <@&owner-role-123> can use it during lockdown mode.',
		flags: ['Ephemeral'],
	});
});
