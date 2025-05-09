import { join } from 'node:path';
import type { ChatInputCommandInteraction } from 'discord.js';
import { RAW_COMMANDS } from '../constants/commands';
import logger from '../utils/logger';

export default async function useCommandHandlers(
	interaction: ChatInputCommandInteraction,
) {
	const { commandName } = interaction;

	if (!RAW_COMMANDS.some((command) => command.name === commandName)) {
		logger.warn(`Unknown command, "${commandName}"`);
		return;
	}

	const { default: handler } = await import(
		join(import.meta.dirname, 'handlers', `${interaction.commandName}.js`)
	);

	await handler(interaction);
}
