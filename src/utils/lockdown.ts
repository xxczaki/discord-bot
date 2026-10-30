import type {
	APIInteractionGuildMember,
	ChatInputCommandInteraction,
	GuildMember,
} from 'discord.js';
import { RAW_COMMANDS } from '../constants/commands.ts';
import getGuildConfig from './getGuildConfig.ts';

export default class LockdownManager {
	static #instance: LockdownManager;
	#lockedDownGuildIds = new Set<string>();
	#lockdownAffectedCategories = new Set(['Music']);
	#ownerOnlyCommands = new Set(['lockdown']);

	private constructor() {}

	static getInstance(): LockdownManager {
		if (!LockdownManager.#instance) {
			LockdownManager.#instance = new LockdownManager();
		}

		return LockdownManager.#instance;
	}

	#getOwnerRoleId(guildId: string | null): string | null {
		return getGuildConfig(guildId)?.ownerRoleId ?? null;
	}

	resetState(): void {
		this.#lockedDownGuildIds.clear();
		this.#lockdownAffectedCategories.clear();
		this.#lockdownAffectedCategories.add('Music');
		this.#ownerOnlyCommands.clear();
		this.#ownerOnlyCommands.add('lockdown');
	}

	isOwner(
		member: GuildMember | APIInteractionGuildMember,
		guildId: string | null,
	): boolean {
		const roleId = this.#getOwnerRoleId(guildId);

		if (!roleId) {
			return false;
		}

		if (Array.isArray(member.roles)) {
			return member.roles.includes(roleId);
		}

		return member.roles.cache.has(roleId);
	}

	isEnabled(guildId: string | null): boolean {
		return guildId !== null && this.#lockedDownGuildIds.has(guildId);
	}

	isAnyEnabled(): boolean {
		return this.#lockedDownGuildIds.size > 0;
	}

	setState(guildId: string, active: boolean): void {
		if (active) {
			this.#lockedDownGuildIds.add(guildId);
		} else {
			this.#lockedDownGuildIds.delete(guildId);
		}
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
		const { member, guildId, commandName } = interaction;

		if (!member) {
			return false;
		}

		if (this.isOwner(member, guildId)) {
			return true;
		}

		if (this.isOwnerOnlyCommand(commandName)) {
			return false;
		}

		if (!this.isEnabled(guildId)) {
			return true;
		}

		const isAffected = this.isCommandAffected(commandName);

		return !isAffected;
	}

	async sendPermissionDeniedMessage(
		interaction: ChatInputCommandInteraction,
	): Promise<void> {
		const roleId = this.#getOwnerRoleId(interaction.guildId);

		if (!roleId) {
			await interaction.reply({
				content: 'This command is not available in this server.',
				flags: ['Ephemeral'],
			});
		} else if (this.isOwnerOnlyCommand(interaction.commandName)) {
			await interaction.reply({
				content: `This command is restricted to <@&${roleId}>.`,
				flags: ['Ephemeral'],
			});
		} else if (
			this.isEnabled(interaction.guildId) &&
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
