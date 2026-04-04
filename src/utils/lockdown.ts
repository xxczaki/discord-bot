import type {
	APIInteractionGuildMember,
	ChatInputCommandInteraction,
	GuildMember,
} from 'discord.js';
import { RAW_COMMANDS } from '../constants/commands';
import getEnvironmentVariable from './getEnvironmentVariable';

export default class LockdownManager {
	static #instance: LockdownManager;
	#ownerRoleId: string | null = null;
	#isLockdownActive = false;
	#lockdownAffectedCategories = new Set(['Music']);
	#ownerOnlyCommands = new Set(['maintenance', 'lockdown']);

	private constructor() {}

	static getInstance(): LockdownManager {
		if (!LockdownManager.#instance) {
			LockdownManager.#instance = new LockdownManager();
		}

		return LockdownManager.#instance;
	}

	#getOwnerRoleId(): string {
		if (this.#ownerRoleId === null) {
			this.#ownerRoleId = getEnvironmentVariable('OWNER_ROLE_ID');
		}
		return this.#ownerRoleId;
	}

	resetState(): void {
		this.#isLockdownActive = false;
		this.#lockdownAffectedCategories.clear();
		this.#lockdownAffectedCategories.add('Music');
		this.#ownerOnlyCommands.clear();
		this.#ownerOnlyCommands.add('maintenance');
		this.#ownerOnlyCommands.add('lockdown');
	}

	isOwner(member: GuildMember | APIInteractionGuildMember): boolean {
		const roleId = this.#getOwnerRoleId();

		if (Array.isArray(member.roles)) {
			return member.roles.includes(roleId);
		}

		return member.roles.cache.has(roleId);
	}

	isEnabled(): boolean {
		return this.#isLockdownActive;
	}

	setState(active: boolean): void {
		this.#isLockdownActive = active;
	}

	isCommandAffected(commandName: string): boolean {
		const command = RAW_COMMANDS.find((cmd) => cmd.name === commandName);
		/* v8 ignore start */
		return command
			? this.#lockdownAffectedCategories.has(command.category)
			: false;
		/* v8 ignore stop */
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
		const member = interaction.member;

		if (!member) {
			return false;
		}

		if (this.isOwner(member)) {
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
		const roleId = this.#getOwnerRoleId();

		if (this.isOwnerOnlyCommand(interaction.commandName)) {
			await interaction.reply({
				content: `This command is restricted to <@&${roleId}>.`,
				flags: ['Ephemeral'],
			});
		} else if (
			this.isEnabled() &&
			this.isCommandAffected(interaction.commandName)
		) {
			await interaction.reply({
				content: `🔒 This command is currently locked down. Only <@&${roleId}> can use it during lockdown mode.`,
				flags: ['Ephemeral'],
			});
		} else {
			await interaction.reply({
				content: `This command is restricted to <@&${roleId}>.`,
				flags: ['Ephemeral'],
			});
		}
	}
}
