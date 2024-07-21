import type { QueueFilters } from 'discord-player';
import { useQueue } from 'discord-player';
import type { CacheType, ChatInputCommandInteraction } from 'discord.js';

export default async function filtersCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	const queue = useQueue(interaction.guild?.id ?? '');
	const filter = interaction.options.getString('audio_filter', false);

	if (!filter) {
		const activeFilters = queue?.filters.ffmpeg.filters
			.filter((name) => !['normalize', 'tempo'].includes(name)) // internal filters
			.join(', ');

		if (!activeFilters) {
			return interaction.editReply('All filters are currently disabled.');
		}

		return interaction.editReply(
			`Currently active filters: \`${activeFilters}\`.`,
		);
	}

	await queue?.filters.ffmpeg.toggle(filter as keyof QueueFilters);

	const activeFilters = queue?.filters.ffmpeg.filters
		.filter((name) => !['normalize', 'tempo'].includes(name)) // internal filters
		.join(', ');

	if (!activeFilters) {
		return interaction.editReply(
			`Toggled the \`${filter}\` filter.\n\nAll filters are now disabled.`,
		);
	}

	await interaction.editReply(
		`Toggled the \`${filter}\` filter.\n\nCurrently active filters: \`${activeFilters}\`.`,
	);
}
