import { useMainPlayer } from 'discord-player';
import { type ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import getCommitLink from '../utils/getCommitLink';

const commitHash = process.env.GIT_COMMIT_SHA;
const wasDeploymentManual = !commitHash;

export default async function debugCommandHandler(
	interaction: ChatInputCommandInteraction,
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
				value: wasDeploymentManual ? 'N/A' : getCommitLink(commitHash),
				inline: true,
			},
		])
		.setFooter({ text: 'Event loop lag should be under 20ms.' });

	await interaction.reply({ embeds: [queueEmbed], flags: ['Ephemeral'] });
}
