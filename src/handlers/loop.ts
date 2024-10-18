import { QueueRepeatMode, useQueue } from 'discord-player';
import type { CacheType, ChatInputCommandInteraction } from 'discord.js';

export default async function loopCommandHandler(
	interaction: ChatInputCommandInteraction<CacheType>,
) {
	const queue = useQueue(interaction.guild?.id ?? '');
	const mode = interaction.options.getInteger('loop_mode', true);

	queue?.setRepeatMode(mode);

	await interaction.reply(
		`Queue loop mode changed to \`${QueueRepeatMode[mode]}\`.`,
	);
}
