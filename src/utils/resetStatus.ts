import { ActivityType, type Client } from 'discord.js';

export default function resetStatus(client: Client<boolean>) {
	client.user?.setActivity('Idle, use /play to get started', {
		type: ActivityType.Custom,
	});
}
