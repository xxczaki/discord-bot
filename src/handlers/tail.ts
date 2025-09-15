import type { ChatInputCommandInteraction, GuildMember } from 'discord.js';
import enqueuePlaylistSlice from '../utils/enqueuePlaylistSlice';

export default async function tailCommandHandler(
	interaction: ChatInputCommandInteraction,
) {
	const voiceChannel = (interaction.member as GuildMember).voice.channel;

	if (!voiceChannel) {
		return interaction.reply({
			content: 'You are not connected to a voice channel!',
			flags: ['Ephemeral'],
		});
	}

	const playlist = interaction.options.getString('playlist', true);
	const count = interaction.options.getInteger('count', true);

	await enqueuePlaylistSlice(
		interaction,
		voiceChannel,
		playlist,
		'tail',
		count,
	);
}
