import { type ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';

export default async function avatarCommandHandler(
	interaction: ChatInputCommandInteraction,
) {
	const user = interaction.options.getUser('user', true);

	const queueEmbed = new EmbedBuilder()
		.setDescription(`Server avatar of <@!${user.id}>`)
		.setImage(user.avatarURL({ size: 512 }));

	await interaction.reply({ embeds: [queueEmbed] });
}
