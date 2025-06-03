import type { ChatInputCommandInteraction } from 'discord.js';
import { RAW_COMMANDS } from '../constants/commands';
import getEnvironmentVariable from './getEnvironmentVariable';

export default class LockdownManager {
	static #instance: LockdownManager;
	#ownerUserId: string | null = null;
	#isLockdownActive = false;
	#lockdownAffectedCategories = new Set(['Music']);
	#ownerOnlyCommands = new Set([
		'maintenance',
		'flush_query_cache',
		'lockdown',
	]);

	private constructor() {}

	static getInstance(): LockdownManager {
		if (!LockdownManager.#instance) {
			LockdownManager.#instance = new LockdownManager();
		}

		return LockdownManager.#instance;
	}

	#getOwnerUserId(): string {
		if (this.#ownerUserId === null) {
			this.#ownerUserId = getEnvironmentVariable('OWNER_USER_ID');
		}
		return this.#ownerUserId;
	}

	resetState(): void {
		this.#isLockdownActive = false;
		this.#lockdownAffectedCategories.clear();
		this.#lockdownAffectedCategories.add('Music');
		this.#ownerOnlyCommands.clear();
		this.#ownerOnlyCommands.add('maintenance');
		this.#ownerOnlyCommands.add('flush_query_cache');
		this.#ownerOnlyCommands.add('lockdown');
	}

	isOwner(userId: string): boolean {
		return userId === this.#getOwnerUserId();
	}

	isEnabled(): boolean {
		return this.#isLockdownActive;
	}

	setState(active: boolean): void {
		this.#isLockdownActive = active;
	}

	isCommandAffected(commandName: string): boolean {
		const command = RAW_COMMANDS.find((cmd) => cmd.name === commandName);
		return command
			? this.#lockdownAffectedCategories.has(command.category)
			: false;
	}

	isOwnerOnlyCommand(commandName: string): boolean {
		return this.#ownerOnlyCommands.has(commandName);
	}

	addCategory(category: string): void {
		this.#lockdownAffectedCategories.add(category);
	}

	removeCategory(category: string): void {
		this.#lockdownAffectedCategories.delete(category);
	}

	getCategories(): string[] {
		return Array.from(this.#lockdownAffectedCategories);
	}

	addOwnerOnlyCommand(commandName: string): void {
		this.#ownerOnlyCommands.add(commandName);
	}

	removeOwnerOnlyCommand(commandName: string): void {
		this.#ownerOnlyCommands.delete(commandName);
	}

	getOwnerOnlyCommands(): string[] {
		return Array.from(this.#ownerOnlyCommands);
	}

	hasCommandPermission(interaction: ChatInputCommandInteraction): boolean {
		const userId = interaction.member?.user.id;

		if (!userId) {
			return false;
		}

		if (this.isOwner(userId)) {
			return true;
		}

		if (this.isOwnerOnlyCommand(interaction.commandName)) {
			return false;
		}

		if (!this.isEnabled()) {
			return true;
		}

		const isAffected = this.isCommandAffected(interaction.commandName);

		return !isAffected;
	}

	async sendPermissionDeniedMessage(
		interaction: ChatInputCommandInteraction,
	): Promise<void> {
		const ownerIdForMessage = this.#getOwnerUserId();

		if (this.isOwnerOnlyCommand(interaction.commandName)) {
			await interaction.reply({
				content: `Only <@!${ownerIdForMessage}> is allowed to run this command.`,
				flags: ['Ephemeral'],
			});
		} else if (
			this.isEnabled() &&
			this.isCommandAffected(interaction.commandName)
		) {
			await interaction.reply({
				content: `🔒 This command is currently locked down. Only <@!${ownerIdForMessage}> can use it during lockdown mode.`,
				flags: ['Ephemeral'],
			});
		} else {
			await interaction.reply({
				content: `Only <@!${ownerIdForMessage}> is allowed to run this command.`,
				flags: ['Ephemeral'],
			});
		}
	}
}
