import type { Client } from 'discord.js';
import useDebugListeners from '../hooks/useDebugListeners';
import useDiscordEventHandlers from '../hooks/useDiscordEventHandlers';
import usePlayerEventHandlers from '../hooks/usePlayerEventHandlers';
import { createDiscordClient } from './createDiscordClient';
import getEnvironmentVariable from './getEnvironmentVariable';
import initializeCommands from './initializeCommands';
import getInitializedPlayer from './initializePlayer';

export interface BotInitializationResult {
	client: Client;
	token: string;
}

export async function initializeBot(): Promise<BotInitializationResult> {
	void initializeCommands();

	const client = createDiscordClient();
	const token = getEnvironmentVariable('TOKEN');

	const player = await getInitializedPlayer(client);

	useDebugListeners(client);
	useDiscordEventHandlers(client, player);
	usePlayerEventHandlers(client, player);

	await client.login(token);

	return { client, token };
}
