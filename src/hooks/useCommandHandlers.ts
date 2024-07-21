import type { CacheType, ChatInputCommandInteraction } from 'discord.js';

export default async function useCommandHandlers(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	switch (interaction.commandName) {
		case 'playlist': {
			await interaction.deferReply();

			const { playlistCommandHandler } = await import('../handlers');

			await playlistCommandHandler(interaction);
			break;
		}
		case 'play': {
			await interaction.deferReply();

			const { playCommandHandler } = await import('../handlers');

			await playCommandHandler(interaction);
			break;
		}
		case 'pause': {
			await interaction.deferReply();

			const { pauseCommandHandler } = await import('../handlers');

			await pauseCommandHandler(interaction);
			break;
		}
		case 'resume': {
			await interaction.deferReply();

			const { resumeCommandHandler } = await import('../handlers');

			await resumeCommandHandler(interaction);
			break;
		}
		case 'skip': {
			await interaction.deferReply();

			const { skipCommandHandler } = await import('../handlers');

			await skipCommandHandler(interaction);
			break;
		}
		case 'remove': {
			await interaction.deferReply();

			const { removeCommandHandler } = await import('../handlers');

			await removeCommandHandler(interaction);
			break;
		}
		case 'move': {
			await interaction.deferReply();

			const { moveCommandHandler } = await import('../handlers');

			await moveCommandHandler(interaction);
			break;
		}
		case 'queue': {
			await interaction.deferReply();

			const { queueCommandHandler } = await import('../handlers');

			await queueCommandHandler(interaction);
			break;
		}
		case 'shuffle': {
			await interaction.deferReply();

			const { shuffleCommandHandler } = await import('../handlers');

			await shuffleCommandHandler(interaction);
			break;
		}
		case 'loop': {
			await interaction.deferReply();

			const { loopCommandHandler } = await import('../handlers');

			await loopCommandHandler(interaction);
			break;
		}
		case 'volume': {
			await interaction.deferReply();

			const { volumeCommandHandler } = await import('../handlers');

			await volumeCommandHandler(interaction);
			break;
		}
		case 'purge': {
			await interaction.deferReply();

			const { purgeCommandHandler } = await import('../handlers');

			await purgeCommandHandler(interaction);
			break;
		}
		case 'debug': {
			await interaction.deferReply({ ephemeral: true });

			const { debugCommandHandler } = await import('../handlers');

			await debugCommandHandler(interaction);
			break;
		}
		case 'deduplicate': {
			await interaction.deferReply();

			const { deduplicateCommandHandler } = await import('../handlers');

			await deduplicateCommandHandler(interaction);
			break;
		}
		case 'sort': {
			await interaction.deferReply();

			const { sortCommandHandler } = await import('../handlers');

			await sortCommandHandler(interaction);
			break;
		}
		case 'stats': {
			await interaction.deferReply();

			const { statsCommandHandler } = await import('../handlers');

			await statsCommandHandler(interaction);
			break;
		}
		case 'filters': {
			await interaction.deferReply();

			const { filtersCommandHandler } = await import('../handlers');

			await filtersCommandHandler(interaction);
			break;
		}
		case 'tempo': {
			await interaction.deferReply();

			const { tempoCommandHandler } = await import('../handlers');

			await tempoCommandHandler(interaction);
			break;
		}
		case 'lateness': {
			await interaction.deferReply();

			const { latenessCommandHandler } = await import('../handlers');

			await latenessCommandHandler(interaction);
			break;
		}
		case 'flush_query_cache': {
			await interaction.deferReply();

			const { flushQueryCacheCommandHandler } = await import('../handlers');

			await flushQueryCacheCommandHandler(interaction);
			break;
		}
		default:
			break;
	}
}
