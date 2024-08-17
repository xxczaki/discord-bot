import type { QueueFilters } from 'discord-player';
import { useQueue } from 'discord-player';
import {
	ActionRowBuilder,
	type CacheType,
	type ChatInputCommandInteraction,
	type SelectMenuComponentOptionData,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
} from 'discord.js';

type OptionData = SelectMenuComponentOptionData & { value: keyof QueueFilters };

const FILTERS: OptionData[] = [
	{ label: 'Bassboost', value: 'bassboost' },
	{ label: 'Earrape', value: 'earrape' },
	{ label: 'Lofi', value: 'lofi' },
	{ label: 'Nightcore', value: 'nightcore' },
	{ label: 'Vaporwave', value: 'vaporwave' },
];

export default async function filtersCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	const queue = useQueue(interaction.guild?.id ?? '');

	const activeFilters =
		queue?.filters.ffmpeg.filters.filter(
			(name) => !['normalize', 'tempo'].includes(name), // internal filters
		) ?? [];

	const filters = getFilters(activeFilters);

	const select = new StringSelectMenuBuilder()
		.setCustomId('filterSelect')
		.setPlaceholder('Select up to 5 filters')
		.addOptions(...filters)
		.setMinValues(0)
		.setMaxValues(5);

	const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
		select,
	);

	const response = await interaction.editReply({
		content: 'Choose which filters you want to toggle:',
		components: [row],
	});

	try {
		const answer = await response.awaitMessageComponent({
			time: 60_000, // 1 minute
		});

		if (answer.isStringSelectMenu()) {
			const toToggle = [
				...answer.values.filter(
					(value) => !activeFilters.includes(value as keyof QueueFilters),
				),
				...activeFilters.filter(
					(value) => !answer.values.includes(value as keyof QueueFilters),
				),
			] as Array<keyof QueueFilters>;

			await queue?.filters.ffmpeg.toggle(toToggle);

			return answer.update({
				content: 'The selected filters were toggled.',
				components: [],
			});
		}

		await answer.update({
			content: 'No filters were selected, aborting…',
			components: [],
		});
	} catch {
		await response.delete();
	}
}

function getFilters(activeFilters: Array<keyof QueueFilters>) {
	return FILTERS.map(({ label, value }) => {
		return new StringSelectMenuOptionBuilder()
			.setLabel(label)
			.setValue(value)
			.setDefault(activeFilters.includes(value));
	});
}
