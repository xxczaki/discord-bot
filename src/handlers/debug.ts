import { useMainPlayer } from 'discord-player';
import {
	type ChatInputCommandInteraction,
	type CacheType,
	EmbedBuilder,
} from 'discord.js';

export default async function debugCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	const player = useMainPlayer();
	const clientLatency = interaction.client.ws.ping.toFixed(0);

	const queueEmbed = new EmbedBuilder()
		.setDescription(`${player.scanDeps()}`)
		.setFields([
			{ name: 'Client latency', value: `${clientLatency}ms`, inline: true },
			{
				name: 'Event loop lag',
				value: `${player.eventLoopLag}ms`,
				inline: true,
			},
		])
		.setFooter({ text: 'Event loop lag should be under 20ms.' });

	await interaction.reply({ embeds: [queueEmbed], ephemeral: true });
}
