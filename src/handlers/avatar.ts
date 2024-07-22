import {
	type CacheType,
	type ChatInputCommandInteraction,
	EmbedBuilder,
} from 'discord.js';

export default async function avatarCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	const user = interaction.options.getUser('user', true);

	const queueEmbed = new EmbedBuilder()
		.setDescription(`Server avatar of <@!${user.id}>.`)
		.setImage(user.avatarURL());

	await interaction.editReply({ embeds: [queueEmbed] });
}
