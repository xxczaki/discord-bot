import { ActivityType, type Client } from 'discord.js';
import { beforeEach, expect, it, vi } from 'vitest';
import LockdownManager from '../lockdown';
import { resetPresence, setPresence } from '../presenceManager';

const mockSetPresence = vi.fn();
const mockClient = {
	user: {
		setPresence: mockSetPresence,
	},
} as unknown as Client<boolean>;

beforeEach(() => {
	vi.clearAllMocks();
	vi.spyOn(LockdownManager.getInstance(), 'isEnabled').mockReturnValue(false);
});

it('should set lockdown presence when lockdown is enabled', () => {
	vi.spyOn(LockdownManager.getInstance(), 'isEnabled').mockReturnValue(true);

	setPresence(mockClient, {
		name: 'Some song',
		type: ActivityType.Listening,
		status: 'online',
	});

	expect(mockSetPresence).toHaveBeenCalledWith({
		activities: [
			{
				name: '🔒 Lockdown mode active',
				type: ActivityType.Custom,
			},
		],
		status: 'online',
	});
});

it('should override custom activity when lockdown is enabled', () => {
	vi.spyOn(LockdownManager.getInstance(), 'isEnabled').mockReturnValue(true);

	setPresence(mockClient, {
		name: 'Custom activity',
		type: ActivityType.Playing,
		url: 'https://example.com',
		status: 'dnd',
	});

	expect(mockSetPresence).toHaveBeenCalledWith({
		activities: [
			{
				name: '🔒 Lockdown mode active',
				type: ActivityType.Custom,
			},
		],
		status: 'dnd',
	});
});

it('should set custom presence when lockdown is disabled', () => {
	setPresence(mockClient, {
		name: 'Playing music',
		type: ActivityType.Listening,
		url: 'https://example.com',
		status: 'online',
	});

	expect(mockSetPresence).toHaveBeenCalledWith({
		activities: [
			{
				name: 'Playing music',
				type: ActivityType.Listening,
				url: 'https://example.com',
			},
		],
		status: 'online',
	});
});

it('should use default values when options are partial', () => {
	setPresence(mockClient, {
		name: 'Custom name',
	});

	expect(mockSetPresence).toHaveBeenCalledWith({
		activities: [
			{
				name: 'Custom name',
				type: ActivityType.Custom,
				url: undefined,
			},
		],
		status: 'online',
	});
});

it('should set idle presence when no options provided and lockdown disabled', () => {
	setPresence(mockClient);

	expect(mockSetPresence).toHaveBeenCalledWith({
		activities: [
			{
				name: 'Idle, use /help to get started',
				type: ActivityType.Custom,
			},
		],
		status: 'idle',
	});
});

it('should set lockdown presence when no options provided but lockdown enabled', () => {
	vi.spyOn(LockdownManager.getInstance(), 'isEnabled').mockReturnValue(true);

	setPresence(mockClient);

	expect(mockSetPresence).toHaveBeenCalledWith({
		activities: [
			{
				name: '🔒 Lockdown mode active',
				type: ActivityType.Custom,
			},
		],
		status: 'online',
	});
});

it('should handle client without user gracefully', () => {
	const clientWithoutUser = { user: null } as Client<boolean>;

	expect(() => setPresence(clientWithoutUser)).not.toThrow();
});

it('should reset presence to idle when lockdown disabled', () => {
	resetPresence(mockClient);

	expect(mockSetPresence).toHaveBeenCalledWith({
		activities: [
			{
				name: 'Idle, use /help to get started',
				type: ActivityType.Custom,
			},
		],
		status: 'idle',
	});
});

it('should reset presence to lockdown when lockdown enabled', () => {
	vi.spyOn(LockdownManager.getInstance(), 'isEnabled').mockReturnValue(true);

	resetPresence(mockClient);

	expect(mockSetPresence).toHaveBeenCalledWith({
		activities: [
			{
				name: '🔒 Lockdown mode active',
				type: ActivityType.Custom,
			},
		],
		status: 'online',
	});
});
