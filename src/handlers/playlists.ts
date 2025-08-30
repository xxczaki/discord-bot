import type { ChatInputCommandInteraction, GuildMember } from 'discord.js';
import enqueuePlaylists from '../utils/enqueuePlaylists';

export default async function playlistsCommandHandler(
	interaction: ChatInputCommandInteraction,
) {
	const voiceChannel = (interaction.member as GuildMember).voice.channel;

	if (!voiceChannel) {
		return interaction.reply({
			content: 'You are not connected to a voice channel!',
			flags: ['Ephemeral'],
		});
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
		return interaction.reply({
			content: 'No playlists selected!',
			flags: ['Ephemeral'],
		});
	}

	// Use the existing enqueuePlaylists function with the new overload
	await enqueuePlaylists(interaction, voiceChannel, selectedPlaylists);
}
