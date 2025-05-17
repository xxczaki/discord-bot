import { ActivityType, type Client, PresenceUpdateStatus } from 'discord.js';
import { beforeEach, expect, it, vi } from 'vitest';
import resetPresence from '../resetPresence';

const mockSetPresence = vi.fn();
const mockClient = {
	user: {
		setPresence: mockSetPresence,
	},
} as unknown as Client<boolean>;

beforeEach(() => {
	vi.clearAllMocks();
});

it('should set correct presence for the client', () => {
	resetPresence(mockClient);

	expect(mockSetPresence).toHaveBeenCalledWith({
		activities: [
			{
				name: 'Idle, use /help to get started',
				type: ActivityType.Custom,
			},
		],
		status: PresenceUpdateStatus.Idle,
	});
});

it('should handle client without user (not ready)', () => {
	const clientWithoutUser = { user: null } as Client<boolean>;

	expect(() => resetPresence(clientWithoutUser)).not.toThrow();
});
