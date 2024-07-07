import type { QueueFilters } from 'discord-player';
import { useQueue } from 'discord-player';
import type { CacheType, ChatInputCommandInteraction } from 'discord.js';

export default async function tempoCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	const queue = useQueue(interaction.guild?.id ?? '');
	const value = interaction.options.getNumber('value', true);

	if (Number.isNaN(value)) {
		await interaction.editReply('Invalid value provided.');
		return;
	}

	const { AudioFilters } = await import('discord-player');

	AudioFilters.define('tempo', `atempo=${value}`);

	await queue?.filters.ffmpeg.toggle('tempo' as keyof QueueFilters);

	await interaction.editReply(`Tempo adjusted to \`${value}\`.`);
}
