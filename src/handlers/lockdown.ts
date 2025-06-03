import type { ChatInputCommandInteraction } from 'discord.js';
import LockdownManager from '../utils/lockdown';
import { setPresence } from '../utils/presenceManager';

export default async function lockdownCommandHandler(
	interaction: ChatInputCommandInteraction,
) {
	const userId = interaction.member?.user.id;
	const lockdown = LockdownManager.getInstance();

	if (!userId || !lockdown.isOwner(userId)) {
		return lockdown.sendPermissionDeniedMessage(interaction);
	}

	const currentState = lockdown.isEnabled();
	const newState = !currentState;
	const affectedCategories = lockdown.getCategories();

	lockdown.setState(newState);

	if (interaction.client) {
		setPresence(interaction.client);
	}

	if (newState) {
		await interaction.reply({
			content: `🔒 **Lockdown mode enabled!**
			
Certain commands are now restricted to the bot owner only.
**Affected Categories:** ${affectedCategories.join(', ')}

Use \`/lockdown\` again to disable lockdown mode.`,
		});
	} else {
		await interaction.reply({
			content: `🔓 **Lockdown mode disabled!**
			
Users can now use the commands again.
**Affected Categories:** ${affectedCategories.join(', ')}`,
		});
	}
}
