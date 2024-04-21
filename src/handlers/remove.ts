import { useQueue } from 'discord-player';
import type { CacheType, ChatInputCommandInteraction } from 'discord.js';

export default async function removeCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	const queue = useQueue(interaction.guild?.id ?? '');
	const trackNumber = interaction.options.getInteger('track_id', true);

	try {
		const trackToRemove = queue?.tracks.at(trackNumber - 1);

		if (!trackToRemove) {
			throw 'fallthrough to catch block';
		}

		queue?.removeTrack(trackNumber - 1);

		await interaction.reply(`Track "${trackToRemove.title}" removed.`);
	} catch {
		await interaction.reply({
			content: 'Could not remove the track, is the specified id correct?',
			ephemeral: true,
		});
	}
}
