import { ActivityType, type Client, type PresenceStatusData } from 'discord.js';
import LockdownManager from './lockdown.ts';

interface PresenceOptions {
	name?: string;
	type?: ActivityType;
	url?: string;
	status?: PresenceStatusData;
}

export function setPresence(
	client: Client<boolean>,
	options?: PresenceOptions,
): void {
	if (LockdownManager.getInstance().isAnyEnabled()) {
		client.user?.setPresence({
			activities: [
				{
					name: '🔒 Lockdown mode active',
					type: ActivityType.Custom,
				},
			],
			status: options?.status ?? 'online',
		});
		return;
	}

	if (!options) {
		client.user?.setPresence({
			activities: [
				{
					name: 'Idle, use /help to get started',
					type: ActivityType.Custom,
				},
			],
			status: 'idle',
		});
		return;
	}

	client.user?.setPresence({
		activities: [
			{
				name: options.name ?? 'Idle, use /help to get started',
				type: options.type ?? ActivityType.Custom,
				url: options.url,
			},
		],
		status: options.status ?? 'online',
	});
}

export function resetPresence(client: Client<boolean>): void {
	setPresence(client);
}
