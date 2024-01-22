import { useQueue } from 'discord-player';
import { type ChatInputCommandInteraction, type CacheType } from 'discord.js';

export default async function volumeCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	const queue = useQueue(interaction.guild?.id ?? '');
	const volume = interaction.options.getInteger('value', true);

	queue?.node.setVolume(volume);

	await interaction.reply(`Volume changed to \`${volume}\`.`);
}
