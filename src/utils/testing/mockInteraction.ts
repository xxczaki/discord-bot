import type {
	ChatInputCommandInteraction,
	GuildMember,
	MessageComponentInteraction,
	User,
	VoiceBasedChannel,
} from 'discord.js';
import { vi } from 'vitest';

interface MockInteractionOptions {
	reply?: boolean;
	editReply?: boolean;
	deferReply?: boolean;
	getString?: string | null;
	getInteger?: number | null;
	getUser?: User | null;
	voiceChannel?: VoiceBasedChannel | null;
	user?: Partial<User>;
	member?: Partial<GuildMember>;
}

export function createMockInteraction(
	options: MockInteractionOptions = {},
): ChatInputCommandInteraction {
	const {
		reply = true,
		editReply = false,
		deferReply = false,
		getString = null,
		getInteger = null,
		getUser = null,
		voiceChannel,
		user,
		member,
	} = options;

	const interaction: Record<string, unknown> = {
		options: {
			getString: vi.fn().mockReturnValue(getString),
			getInteger: vi.fn().mockReturnValue(getInteger),
			getUser: vi.fn().mockReturnValue(getUser),
		},
	};

	if (reply) {
		interaction.reply = vi.fn().mockResolvedValue({});
	}

	if (editReply) {
		interaction.editReply = vi.fn().mockResolvedValue({});
	}

	if (deferReply) {
		interaction.deferReply = vi.fn().mockResolvedValue({});
	}

	if (voiceChannel !== undefined) {
		interaction.member = {
			voice: { channel: voiceChannel },
			...member,
		} as GuildMember;
	} else if (member) {
		interaction.member = member as GuildMember;
	}

	if (user) {
		interaction.user = user;
	}

	return interaction as unknown as ChatInputCommandInteraction;
}

export function createMockComponentInteraction(
	customId: string,
): MessageComponentInteraction {
	return {
		customId,
		update: vi.fn().mockResolvedValue({}),
	} as unknown as MessageComponentInteraction;
}
