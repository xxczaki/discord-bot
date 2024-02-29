import type { QueueFilters } from 'discord-player';
import { useQueue } from 'discord-player';
import { type ChatInputCommandInteraction, type CacheType } from 'discord.js';

export default async function filtersCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	const queue = useQueue(interaction.guild?.id ?? '');
	const filter = interaction.options.getString('audio_filter', false);

	await interaction.deferReply();

	if (!filter) {
		const activeFilters = queue?.filters.ffmpeg.filters
			.filter(name => !['normalize', 'tempo'].includes(name)) // internal filters
			.join(', ');

		if (!activeFilters) {
			await interaction.followUp('All filters are currently disabled.');
			return;
		}

		await interaction.followUp(
			`Currently active filters: \`${activeFilters}\`.`,
		);
		return;
	}

	await queue?.filters.ffmpeg.toggle(filter as keyof QueueFilters);

	const activeFilters = queue?.filters.ffmpeg.filters
		.filter(name => !['normalize', 'tempo'].includes(name)) // internal filters
		.join(', ');

	if (!activeFilters) {
		await interaction.followUp(
			`Toggled the \`${filter}\` filter.\n\nAll filters are now disabled.`,
		);
		return;
	}

	await interaction.followUp(
		`Toggled the \`${filter}\` filter.\n\nCurrently active filters: \`${activeFilters}\`.`,
	);
}
