import {
	ActivityType,
	Client,
	GatewayIntentBits,
	PresenceUpdateStatus,
} from 'discord.js';

export interface CreateDiscordClientOptions {
	token: string;
	debugChannelId?: string;
}

export function createDiscordClient(): Client {
	return new Client({
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
	});
}
