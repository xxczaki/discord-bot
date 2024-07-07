import { ActivityType, type Client, PresenceUpdateStatus } from 'discord.js';

export default function resetStatus(client: Client<boolean>) {
	client.user?.setPresence({
		activities: [
			{
				name: 'Idle, use /play to get started',
				type: ActivityType.Custom,
			},
		],
		status: PresenceUpdateStatus.Idle,
	});
}
