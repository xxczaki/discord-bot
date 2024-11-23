import type { CacheType, ChatInputCommandInteraction } from 'discord.js';
import {
	avatarCommandHandler,
	debugCommandHandler,
	deduplicateCommandHandler,
	filtersCommandHandler,
	flushQueryCacheCommandHandler,
	latenessCommandHandler,
	moveCommandHandler,
	pauseCommandHandler,
	playCommandHandler,
	playlistsCommandHandler,
	purgeCommandHandler,
	queueCommandHandler,
	recoverCommandHandler,
	removeCommandHandler,
	repeatCommandHandler,
	resumeCommandHandler,
	shuffleCommandHandler,
	skipCommandHandler,
	sortCommandHandler,
	statsCommandHandler,
	tempoCommandHandler,
	ticTacToeCommandHandler,
	volumeCommandHandler,
} from '../handlers';

export default async function useCommandHandlers(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	switch (interaction.commandName) {
		case 'playlists': {
			await playlistsCommandHandler(interaction);
			break;
		}
		case 'play': {
			await playCommandHandler(interaction);
			break;
		}
		case 'pause': {
			await pauseCommandHandler(interaction);
			break;
		}
		case 'resume': {
			await resumeCommandHandler(interaction);
			break;
		}
		case 'skip': {
			await skipCommandHandler(interaction);
			break;
		}
		case 'remove': {
			await removeCommandHandler(interaction);
			break;
		}
		case 'move': {
			await moveCommandHandler(interaction);
			break;
		}
		case 'queue': {
			await queueCommandHandler(interaction);
			break;
		}
		case 'shuffle': {
			await shuffleCommandHandler(interaction);
			break;
		}
		case 'repeat': {
			await repeatCommandHandler(interaction);
			break;
		}
		case 'volume': {
			await volumeCommandHandler(interaction);
			break;
		}
		case 'purge': {
			await purgeCommandHandler(interaction);
			break;
		}
		case 'debug': {
			await debugCommandHandler(interaction);
			break;
		}
		case 'deduplicate': {
			await deduplicateCommandHandler(interaction);
			break;
		}
		case 'sort': {
			await sortCommandHandler(interaction);
			break;
		}
		case 'stats': {
			await statsCommandHandler(interaction);
			break;
		}
		case 'filters': {
			await filtersCommandHandler(interaction);
			break;
		}
		case 'tempo': {
			await tempoCommandHandler(interaction);
			break;
		}
		case 'lateness': {
			await latenessCommandHandler(interaction);
			break;
		}
		case 'flush_query_cache': {
			await flushQueryCacheCommandHandler(interaction);
			break;
		}
		case 'avatar': {
			await avatarCommandHandler(interaction);
			break;
		}
		case 'tic_tac_toe': {
			await ticTacToeCommandHandler(interaction);
			break;
		}
		case 'recover': {
			await recoverCommandHandler(interaction);
			break;
		}
		default:
			break;
	}
}
