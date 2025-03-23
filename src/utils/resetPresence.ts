import { ActivityType, type Client, PresenceUpdateStatus } from 'discord.js';

export default function resetPresence(client: Client<boolean>) {
	client.user?.setPresence({
		activities: [
			{
				name: 'Idle, use /help to get started',
				type: ActivityType.Custom,
			},
		],
		status: PresenceUpdateStatus.Idle,
	});
}
