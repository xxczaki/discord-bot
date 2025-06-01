import type { Client } from 'discord.js';
import useDebugListeners from '../hooks/useDebugListeners';
import useDiscordEventHandlers, {
	useReadyEventHandler,
} from '../hooks/useDiscordEventHandlers';
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

	useReadyEventHandler(client);

	await client.login(token);

	const player = await getInitializedPlayer(client);

	useDebugListeners(client, player);
	useDiscordEventHandlers(client, player);
	usePlayerEventHandlers(client, player);

	return { client, token };
}
