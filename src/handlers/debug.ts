import { useMainPlayer } from 'discord-player';
import {
	type CacheType,
	type ChatInputCommandInteraction,
	EmbedBuilder,
} from 'discord.js';
import getReleaseDetails from '../utils/getCommitLink';

export default async function debugCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	const player = useMainPlayer();
	const clientLatency = interaction.client.ws.ping.toFixed(0);

	const queueEmbed = new EmbedBuilder()
		.setDescription(`\`\`\`\n${player.scanDeps()}\n\`\`\``)
		.setFields([
			{ name: 'Client latency', value: `${clientLatency}ms`, inline: true },
			{
				name: 'Event loop lag',
				value: `${player.eventLoopLag}ms`,
				inline: true,
			},
			{
				name: 'Release',
				value: getReleaseDetails(),
				inline: true,
			},
		])
		.setFooter({ text: 'Event loop lag should be under 20ms.' });

	await interaction.reply({ embeds: [queueEmbed], ephemeral: true });
}
