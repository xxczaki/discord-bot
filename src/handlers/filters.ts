import type { QueueFilters } from 'discord-player';
import { useQueue } from 'discord-player';
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	type CacheType,
	type ChatInputCommandInteraction,
	type SelectMenuComponentOptionData,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
} from 'discord.js';
import { DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS } from '../constants/miscellaneous';

type OptionData = SelectMenuComponentOptionData & { value: keyof QueueFilters };

const FILTERS: OptionData[] = [
	{ label: 'Bassboost', value: 'bassboost' },
	{ label: 'Earrape', value: 'earrape' },
	{ label: 'Lofi', value: 'lofi' },
	{ label: 'Nightcore', value: 'nightcore' },
	{ label: 'Vaporwave', value: 'vaporwave' },
	{ label: 'Tremolo', value: 'tremolo' },
	{ label: 'Vibrato', value: 'vibrato' },
	{ label: '8D', value: '8D' },
];

export default async function filtersCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	const queue = useQueue();

	const activeFilters =
		queue?.filters.ffmpeg.filters.filter(
			(name) => !name.startsWith('_'), // exclude the custom filters
		) ?? [];

	const filters = getFilters(activeFilters);

	const select = new StringSelectMenuBuilder()
		.setCustomId('filterSelect')
		.setPlaceholder('Select up to 3 filters')
		.addOptions(...filters)
		.setMinValues(0)
		.setMaxValues(3);

	const cancel = new ButtonBuilder()
		.setCustomId('cancel')
		.setLabel('Cancel')
		.setStyle(ButtonStyle.Secondary);

	const selects = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
		select,
	);
	const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(cancel);

	const response = await interaction.reply({
		content: 'Choose which filters you want to toggle:',
		components: [selects, buttons],
		flags: ['Ephemeral'],
	});

	const answer = await response.awaitMessageComponent({
		time: DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS,
	});

	if (answer.isButton()) {
		return response.delete();
	}

	if (answer.isStringSelectMenu()) {
		const toToggle = [
			...answer.values.filter(
				(value) => !activeFilters.includes(value as keyof QueueFilters),
			),
			...activeFilters.filter((value) => !answer.values.includes(value)),
		] as Array<keyof QueueFilters>;

		await answer.reply({
			content: 'Toggling the selected filters…',
			components: [],
		});

		await queue?.filters.ffmpeg.toggle(toToggle);

		await response.delete();

		return answer.editReply({
			content: 'The selected filters were toggled.',
			components: [],
		});
	}

	await response.delete();

	return answer.editReply({
		content: 'No filters were selected, aborting…',
		components: [],
	});
}

function getFilters(activeFilters: Array<keyof QueueFilters>) {
	return FILTERS.map(({ label, value }) => {
		return new StringSelectMenuOptionBuilder()
			.setLabel(label)
			.setValue(value)
			.setDefault(activeFilters.includes(value));
	});
}
