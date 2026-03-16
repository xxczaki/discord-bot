import { join } from 'node:path';
import type { ChatInputCommandInteraction } from 'discord.js';
import { RAW_COMMANDS } from '../constants/commands';
import LockdownManager from '../utils/lockdown';
import logger from '../utils/logger';
import reportError from '../utils/reportError';
import snakeToCamelCase from '../utils/snakeToCamelCase';

const EPHEMERAL_COMMANDS = new Set(['debug', 'help', 'tic_tac_toe', 'filters']);

export default async function useCommandHandlers(
	interaction: ChatInputCommandInteraction,
) {
	const { commandName } = interaction;

	if (!RAW_COMMANDS.some((command) => command.name === commandName)) {
		logger.warn(`Unknown command, "${commandName}"`);
		return;
	}

	const lockdown = LockdownManager.getInstance();

	if (!lockdown.hasCommandPermission(interaction)) {
		return lockdown.sendPermissionDeniedMessage(interaction);
	}

	try {
		await interaction.deferReply({
			flags: EPHEMERAL_COMMANDS.has(commandName) ? ['Ephemeral'] : [],
		});
	} catch (deferError) {
		logger.error(
			deferError,
			`Failed to defer reply for command "${commandName}"`,
		);
		return;
	}

	const fileName = snakeToCamelCase(interaction.commandName);

	try {
		const { default: handler } = await import(
			join(import.meta.dirname, 'handlers', `${fileName}.js`)
		);

		await handler(interaction);
	} catch (error) {
		reportError(error, `Failed to handle command "${commandName}"`);

		if (!interaction.replied) {
			try {
				await interaction.editReply(
					'Sorry, an error occurred while processing your command. Please try again.',
				);
			} catch (replyError) {
				logger.error(replyError, 'Failed to send error reply to interaction');
			}
		}
	}
}
