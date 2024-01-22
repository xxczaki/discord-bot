import { REST, Routes } from 'discord.js';
import COMMANDS from '../constants/commands';
import getEnvironmentVariable from './getEnvironmentVariable';

const token = getEnvironmentVariable('TOKEN');
const clientId = getEnvironmentVariable('CLIENT_ID');

const rest = new REST({ version: '10' }).setToken(token);

export default async function initializeCommands() {
	try {
		console.log('Started refreshing application (/) commands.');

		await rest.put(Routes.applicationCommands(clientId), {
			body: COMMANDS,
		});

		console.log('Successfully reloaded application (/) commands.');
	} catch (error) {
		console.error(error);
	}
}
