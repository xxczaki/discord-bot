import {
	ActivityType,
	GatewayIntentBits,
	PresenceUpdateStatus,
} from 'discord.js';
import { expect, it, vi } from 'vitest';
import { createDiscordClient } from '../createDiscordClient';

vi.mock('discord.js', async () => {
	const actual = await vi.importActual('discord.js');
	return {
		...actual,
		Client: vi.fn().mockImplementation((options: unknown) => ({
			options,
		})),
	};
});

const EXPECTED_CLIENT_OPTIONS = {
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildVoiceStates,
		GatewayIntentBits.GuildPresences,
		GatewayIntentBits.MessageContent,
	],
	presence: {
		activities: [
			{
				name: 'Idle, use /help to get started',
				type: ActivityType.Custom,
			},
		],
		status: PresenceUpdateStatus.Idle,
	},
};

it('should create a Discord client with correct configuration', () => {
	const client = createDiscordClient();

	expect(client.options).toEqual(EXPECTED_CLIENT_OPTIONS);
});

it('should include all required intents', () => {
	const client = createDiscordClient();

	const intents = client.options.intents;
	expect(intents).toContain(GatewayIntentBits.Guilds);
	expect(intents).toContain(GatewayIntentBits.GuildVoiceStates);
	expect(intents).toContain(GatewayIntentBits.GuildPresences);
	expect(intents).toContain(GatewayIntentBits.MessageContent);
});

it('should set idle presence by default', () => {
	const client = createDiscordClient();

	const presence = client.options.presence;
	expect(presence?.status).toBe(PresenceUpdateStatus.Idle);
	expect(presence?.activities).toHaveLength(1);
	expect(presence?.activities?.[0]).toMatchObject({
		name: 'Idle, use /help to get started',
		type: ActivityType.Custom,
	});
});
