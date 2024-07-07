import type { CacheType, ChatInputCommandInteraction } from 'discord.js';

import {
	debugCommandHandler,
	deduplicateCommandHandler,
	filtersCommandHandler,
	latenessCommandHandler,
	loopCommandHandler,
	moveCommandHandler,
	pauseCommandHandler,
	playCommandHandler,
	playlistCommandHandler,
	purgeCommandHandler,
	queueCommandHandler,
	removeCommandHandler,
	resumeCommandHandler,
	shuffleCommandHandler,
	skipCommandHandler,
	sortCommandHandler,
	statsCommandHandler,
	tempoCommandHandler,
	volumeCommandHandler,
} from '../handlers';

export default async function useCommandHandlers(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	switch (interaction.commandName) {
		case 'playlist':
			await playlistCommandHandler(interaction);
			break;
		case 'play':
			await interaction.deferReply();
			await playCommandHandler(interaction);
			break;
		case 'pause':
			await interaction.deferReply();
			await pauseCommandHandler(interaction);
			break;
		case 'resume':
			await interaction.deferReply();
			await resumeCommandHandler(interaction);
			break;
		case 'skip':
			await interaction.deferReply();
			await skipCommandHandler(interaction);
			break;
		case 'remove':
			await interaction.deferReply();
			await removeCommandHandler(interaction);
			break;
		case 'move':
			await interaction.deferReply();
			await moveCommandHandler(interaction);
			break;
		case 'queue':
			await interaction.deferReply();
			await queueCommandHandler(interaction);
			break;
		case 'shuffle':
			await interaction.deferReply();
			await shuffleCommandHandler(interaction);
			break;
		case 'loop':
			await interaction.deferReply();
			await loopCommandHandler(interaction);
			break;
		case 'volume':
			await interaction.deferReply();
			await volumeCommandHandler(interaction);
			break;
		case 'purge':
			await interaction.deferReply();
			await purgeCommandHandler(interaction);
			break;
		case 'debug':
			await interaction.deferReply({ ephemeral: true });
			await debugCommandHandler(interaction);
			break;
		case 'deduplicate':
			await interaction.deferReply();
			await deduplicateCommandHandler(interaction);
			break;
		case 'sort':
			await interaction.deferReply();
			await sortCommandHandler(interaction);
			break;
		case 'stats':
			await interaction.deferReply();
			await statsCommandHandler(interaction);
			break;
		case 'filters':
			await interaction.deferReply();
			await filtersCommandHandler(interaction);
			break;
		case 'tempo':
			await interaction.deferReply();
			await tempoCommandHandler(interaction);
			break;
		case 'lateness':
			await interaction.deferReply();
			await latenessCommandHandler(interaction);
			break;
		default:
			break;
	}
}
