import type { ChatInputCommandInteraction } from 'discord.js';
import {
	type CategorizedCommand,
	COMMAND_CATEGORIES,
	RAW_COMMANDS,
} from '../constants/commands';

const categorizedCommands = Object.groupBy(
	RAW_COMMANDS.sort((a, b) => a.name.localeCompare(b.name)).map(
		processRawCommand,
	),
	({ category }) => category,
);

const helpMessageContent = `
	${processCategories()}
`.trim();

export default async function helpCommandHandler(
	interaction: ChatInputCommandInteraction,
) {
	await interaction.reply({
		content: helpMessageContent,
		flags: ['Ephemeral'],
	});
}

function processCategories() {
	return COMMAND_CATEGORIES.map(processCategory).join('\n\n');
}

function processCategory(category: (typeof COMMAND_CATEGORIES)[number]) {
	return `
### ${category}
${categorizedCommands[category]?.map(({ text }) => text).join('\n')}
`.trim();
}

function processRawCommand(command: CategorizedCommand) {
	return {
		text: `
┌ ${getCommandNotation(command)}
├ ${command.description}
	`.trim(),
		category: command.category,
	};
}

function getCommandNotation(command: CategorizedCommand) {
	if (!command.options) {
		return `\`/${command.name}\``;
	}

	return `\`/${command.name} ${command.options.map((option) => `<${'required' in option ? '' : '?'}${option.name}>`).join(' ')}\``;
}
