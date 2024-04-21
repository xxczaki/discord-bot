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
			await playCommandHandler(interaction);
			break;
		case 'pause':
			await pauseCommandHandler(interaction);
			break;
		case 'resume':
			await resumeCommandHandler(interaction);
			break;
		case 'skip':
			await skipCommandHandler(interaction);
			break;
		case 'remove':
			await removeCommandHandler(interaction);
			break;
		case 'move':
			await moveCommandHandler(interaction);
			break;
		case 'queue':
			await queueCommandHandler(interaction);
			break;
		case 'shuffle':
			await shuffleCommandHandler(interaction);
			break;
		case 'loop':
			await loopCommandHandler(interaction);
			break;
		case 'volume':
			await volumeCommandHandler(interaction);
			break;
		case 'purge':
			await purgeCommandHandler(interaction);
			break;
		case 'debug':
			await debugCommandHandler(interaction);
			break;
		case 'deduplicate':
			await deduplicateCommandHandler(interaction);
			break;
		case 'sort':
			await sortCommandHandler(interaction);
			break;
		case 'stats':
			await statsCommandHandler(interaction);
			break;
		case 'filters':
			await filtersCommandHandler(interaction);
			break;
		case 'tempo':
			await tempoCommandHandler(interaction);
			break;
		case 'lateness':
			await latenessCommandHandler(interaction);
			break;
		default:
			break;
	}
}
