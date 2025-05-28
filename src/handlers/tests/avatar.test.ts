import type { ChatInputCommandInteraction, User } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { beforeEach, expect, it, vi } from 'vitest';
import avatarCommandHandler from '../avatar';

const EXAMPLE_USER_ID = '123456789012345678';
const EXAMPLE_AVATAR_URL =
	'https://cdn.discordapp.com/avatars/123456789012345678/example.png';

function createMockUser(): User {
	return {
		id: EXAMPLE_USER_ID,
		avatarURL: vi.fn().mockReturnValue(EXAMPLE_AVATAR_URL),
	} as unknown as User;
}

function createMockInteraction(user: User): ChatInputCommandInteraction {
	return {
		options: {
			getUser: vi.fn().mockReturnValue(user),
		},
		reply: vi.fn().mockResolvedValue({}),
	} as unknown as ChatInputCommandInteraction;
}

beforeEach(() => {
	vi.clearAllMocks();
});

it('should create embed with user avatar and reply with it', async () => {
	const mockUser = createMockUser();
	const mockInteraction = createMockInteraction(mockUser);

	await avatarCommandHandler(mockInteraction);

	expect(mockInteraction.options.getUser).toHaveBeenCalledWith('user', true);
	expect(mockUser.avatarURL).toHaveBeenCalledWith({ size: 512 });
	expect(mockInteraction.reply).toHaveBeenCalledOnce();

	const [[callArgs]] = vi.mocked(mockInteraction.reply).mock.calls;
	const { embeds } = callArgs as { embeds: EmbedBuilder[] };

	expect(embeds).toHaveLength(1);
	expect(embeds[0]).toBeInstanceOf(EmbedBuilder);
	expect(embeds[0].data.description).toBe(
		`Server avatar of <@!${EXAMPLE_USER_ID}>`,
	);
	expect(embeds[0].data.image?.url).toBe(EXAMPLE_AVATAR_URL);
});

it('should handle user with null avatar URL', async () => {
	const mockUser = createMockUser();
	vi.mocked(mockUser.avatarURL).mockReturnValue(null);
	const mockInteraction = createMockInteraction(mockUser);

	await avatarCommandHandler(mockInteraction);

	expect(mockInteraction.reply).toHaveBeenCalledOnce();

	const [[callArgs]] = vi.mocked(mockInteraction.reply).mock.calls;
	const { embeds } = callArgs as { embeds: EmbedBuilder[] };

	expect(embeds[0].data.image?.url).toBeUndefined();
});
