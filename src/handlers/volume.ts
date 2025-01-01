import { useQueue } from 'discord-player';
import type { CacheType, ChatInputCommandInteraction } from 'discord.js';

export default async function volumeCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	const queue = useQueue();
	const volume = interaction.options.getInteger('value', true);

	queue?.node.setVolume(volume);

	await interaction.reply(`Volume changed to \`${volume}\`.`);
}
