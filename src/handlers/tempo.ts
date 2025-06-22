import {
	ActionRowBuilder,
	type ChatInputCommandInteraction,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
} from 'discord.js';
import type { QueueFilters } from 'discord-player';
import createQueueAwareComponentHandler from '../utils/createQueueAwareComponentHandler';
import useQueueWithValidation from '../utils/useQueueWithValidation';

export default async function tempoCommandHandler(
	interaction: ChatInputCommandInteraction,
) {
	const queue = useQueueWithValidation(interaction);

	if (!queue) return;

	const activeTempo = queue.filters.ffmpeg.filters.find((name) =>
		name?.startsWith('_tempo'),
	) as string | undefined;

	const select = new StringSelectMenuBuilder()
		.setCustomId('tempoSelect')
		.setPlaceholder('Select the playback speed')
		.addOptions(
			new StringSelectMenuOptionBuilder()
				.setLabel('0.5')
				.setValue('_tempo05')
				.setDefault(activeTempo === '_tempo05'),
			new StringSelectMenuOptionBuilder()
				.setLabel('0.75')
				.setValue('_tempo075')
				.setDefault(activeTempo === '_tempo075'),
			new StringSelectMenuOptionBuilder()
				.setLabel('Normal')
				.setValue('normal')
				.setDefault(!activeTempo),
			new StringSelectMenuOptionBuilder()
				.setLabel('1.25')
				.setValue('_tempo125')
				.setDefault(activeTempo === '_tempo125'),
			new StringSelectMenuOptionBuilder()
				.setLabel('1.5')
				.setValue('_tempo15')
				.setDefault(activeTempo === '_tempo15'),
			new StringSelectMenuOptionBuilder()
				.setLabel('1.75')
				.setValue('_tempo175')
				.setDefault(activeTempo === '_tempo175'),
			new StringSelectMenuOptionBuilder()
				.setLabel('2')
				.setValue('_tempo2')
				.setDefault(activeTempo === '_tempo2'),
		);

	const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
		select,
	);

	const response = await interaction.reply({
		components: [row],
	});

	const handler = createQueueAwareComponentHandler({
		response,
		queue,
	});

	try {
		const answer = await response.awaitMessageComponent({
			time: handler.timeout,
		});

		if (answer.isStringSelectMenu()) {
			await answer.reply('Modifying the playback speed…');

			if (!activeTempo) {
				await queue.filters.ffmpeg.toggle(
					answer.values[0] as keyof QueueFilters,
				);
			} else if (answer.values[0] === 'normal') {
				await queue.filters.ffmpeg.toggle(activeTempo as keyof QueueFilters);
			} else {
				await queue.filters.ffmpeg.toggle([
					activeTempo,
					answer.values[0],
				] as Array<keyof QueueFilters>);
			}

			return await answer.editReply({
				content: 'The playback speed was modified.',
				components: [],
			});
		}

		await answer.editReply({
			content: 'Nothing was selected; the playback speed remains as is.',
			components: [],
		});
	} catch {
	} finally {
		await handler.cleanup();
	}
}
