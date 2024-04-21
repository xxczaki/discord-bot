import type { QueueFilters } from 'discord-player';
import { AudioFilters, useQueue } from 'discord-player';
import type { CacheType, ChatInputCommandInteraction } from 'discord.js';

export default async function tempoCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	const queue = useQueue(interaction.guild?.id ?? '');
	const value = interaction.options.getNumber('value', true);

	await interaction.deferReply();

	if (Number.isNaN(value)) {
		await interaction.reply({
			content: 'Invalid value provided.',
			ephemeral: true,
		});
		return;
	}

	AudioFilters.define('tempo', `atempo=${value}`);

	await queue?.filters.ffmpeg.toggle('tempo' as keyof QueueFilters);

	await interaction.followUp(`Tempo adjusted to \`${value}\`.`);
}
