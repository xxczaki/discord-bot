import { REST, Routes } from 'discord.js';
import COMMANDS from '../constants/commands';
import getEnvironmentVariable from './getEnvironmentVariable';
import logger from './logger';
import reportError from './reportError';

const token = getEnvironmentVariable('TOKEN');
const clientId = getEnvironmentVariable('CLIENT_ID');

const rest = new REST({ version: '10' }).setToken(token);

export default async function initializeCommands() {
	try {
		logger.info('Started refreshing application commands.');

		await rest.put(Routes.applicationCommands(clientId), {
			body: COMMANDS,
			signal: AbortSignal.timeout(10_000),
		});

		logger.info('Successfully reloaded application commands.');
	} catch (error) {
		reportError(error, 'Application commands refresh failure');
	}
}
