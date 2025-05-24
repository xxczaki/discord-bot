import { join } from 'node:path';
import type { ChatInputCommandInteraction } from 'discord.js';
import { RAW_COMMANDS } from '../constants/commands';
import logger from '../utils/logger';
import snakeToCamelCase from '../utils/snakeToCamelCase';

export default async function useCommandHandlers(
	interaction: ChatInputCommandInteraction,
) {
	const { commandName } = interaction;

	if (!RAW_COMMANDS.some((command) => command.name === commandName)) {
		logger.warn(`Unknown command, "${commandName}"`);
		return;
	}

	const fileName = snakeToCamelCase(interaction.commandName);

	const { default: handler } = await import(
		join(import.meta.dirname, 'handlers', `${fileName}.js`)
	);

	await handler(interaction);
}
