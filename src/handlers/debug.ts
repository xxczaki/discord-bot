import type { QueueFilters } from 'discord-player';
import { useMainPlayer, useQueue } from 'discord-player';
import {
	type CacheType,
	type ChatInputCommandInteraction,
	EmbedBuilder,
} from 'discord.js';

export default async function debugCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	const player = useMainPlayer();
	const queue = useQueue(interaction.guild?.id ?? '');
	const clientLatency = interaction.client.ws.ping.toFixed(0);

	const isNormalizationActive = queue?.filters.ffmpeg.filters.includes(
		'normalize' as keyof QueueFilters,
	);

	const queueEmbed = new EmbedBuilder()
		.setDescription(`${player.scanDeps()}`)
		.setFields([
			{ name: 'Client latency', value: `${clientLatency}ms`, inline: true },
			{
				name: 'Event loop lag',
				value: `${player.eventLoopLag}ms`,
				inline: true,
			},
			{
				name: 'Normalization',
				value: isNormalizationActive ? '✅' : '❌',
				inline: true,
			},
		])
		.setFooter({ text: 'Event loop lag should be under 20ms.' });

	await interaction.reply({ embeds: [queueEmbed], ephemeral: true });
}
