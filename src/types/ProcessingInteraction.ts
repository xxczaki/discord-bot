import type {
	InteractionEditReplyOptions,
	InteractionReplyOptions,
	TextBasedChannel,
	User,
} from 'discord.js';

/**
 * Unified interface for interactions that can reply and edit replies.
 * This facade allows different Discord.js interaction types to work
 * seamlessly with utility functions that need to provide user feedback.
 *
 * Supports:
 * - ChatInputCommandInteraction
 * - StringSelectMenuInteraction
 * - ButtonInteraction
 * - Custom adapter objects for Message-based responses
 */
export interface ProcessingInteraction {
	user: User;
	channel: TextBasedChannel | null;
	reply(options: InteractionReplyOptions): Promise<unknown>;
	editReply(options: InteractionEditReplyOptions): Promise<unknown>;
}
