import type { Client } from 'discord.js';
import useDebugListeners, { server } from '../hooks/useDebugListeners.ts';
import useDiscordEventHandlers, {
	useReadyEventHandler,
} from '../hooks/useDiscordEventHandlers.ts';
import usePlayerEventHandlers from '../hooks/usePlayerEventHandlers.ts';
import { createDiscordClient } from './createDiscordClient.ts';
import getEnvironmentVariable from './getEnvironmentVariable.ts';
import setupGracefulShutdown from './gracefulShutdown.ts';
import initializeCommands from './initializeCommands.ts';
import getInitializedPlayer from './initializePlayer.ts';
import migrateLegacyStats from './migrateLegacyStats.ts';
import performStartupRecovery from './startupRecovery.ts';

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
	void migrateLegacyStats(client);
	setupGracefulShutdown(client, server);

	return { client, token };
}
