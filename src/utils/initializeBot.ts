import type { Client } from 'discord.js';
import useDebugListeners, { server } from '../hooks/useDebugListeners';
import useDiscordEventHandlers, {
	useReadyEventHandler,
} from '../hooks/useDiscordEventHandlers';
import usePlayerEventHandlers from '../hooks/usePlayerEventHandlers';
import { createDiscordClient } from './createDiscordClient';
import getEnvironmentVariable from './getEnvironmentVariable';
import setupGracefulShutdown from './gracefulShutdown';
import initializeCommands from './initializeCommands';
import getInitializedPlayer from './initializePlayer';
import performStartupRecovery from './startupRecovery';

export interface BotInitializationResult {
	client: Client;
	token: string;
}

export async function initializeBot(): Promise<BotInitializationResult> {
	await initializeCommands();

	const client = createDiscordClient();
	const token = getEnvironmentVariable('TOKEN');

	useReadyEventHandler(client);

	await client.login(token);

	const player = await getInitializedPlayer(client);

	useDebugListeners(client, player);
	useDiscordEventHandlers(client, player);
	usePlayerEventHandlers(client, player);

	void performStartupRecovery(client, player);
	setupGracefulShutdown(client, server);

	return { client, token };
}
