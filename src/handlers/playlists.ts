import type { ChatInputCommandInteraction, GuildMember } from 'discord.js';
import enqueuePlaylists from '../utils/enqueuePlaylists';

export default async function playlistsCommandHandler(
	interaction: ChatInputCommandInteraction,
) {
	const voiceChannel = (interaction.member as GuildMember).voice.channel;

	if (!voiceChannel) {
		return interaction.editReply('You are not connected to a voice channel!');
	}

	// Get selected playlists from the command options
	const selectedPlaylists = [
		interaction.options.getString('playlist1'),
		interaction.options.getString('playlist2'),
		interaction.options.getString('playlist3'),
		interaction.options.getString('playlist4'),
		interaction.options.getString('playlist5'),
	].filter((playlist): playlist is string => playlist !== null);

	if (selectedPlaylists.length === 0) {
		return interaction.editReply('No playlists selected!');
	}

	await enqueuePlaylists(interaction, voiceChannel, selectedPlaylists);
}
