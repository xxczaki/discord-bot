import { useQueue } from 'discord-player';
import type { CacheType, ChatInputCommandInteraction } from 'discord.js';

export default async function removeCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	const queue = useQueue();
	const query = interaction.options.getString('query', true);
	const trackNumber = Number.parseInt(query, 10);

	if (Number.isNaN(trackNumber)) {
		return interaction.reply({
			content: 'Please provide a number.',
			flags: ['Ephemeral'],
		});
	}

	try {
		const trackToRemove = queue?.tracks.at(trackNumber - 2);

		if (!trackToRemove) {
			throw 'fallthrough to catch block';
		}

		if (trackNumber === 1) {
			queue?.node.skip();

			await interaction.reply('Skipping the current track.');
		} else {
			queue?.removeTrack(trackNumber - 2);

			await interaction.reply(`Track "${trackToRemove.title}" removed.`);
		}
	} catch {
		await interaction.reply({
			content: 'Could not remove the track, is the specified id correct?',
			flags: ['Ephemeral'],
		});
	}
}
