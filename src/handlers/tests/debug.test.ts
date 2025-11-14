import type {
	ChatInputCommandInteraction,
	InteractionReplyOptions,
	WebSocketManager,
} from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const EXAMPLE_COMMIT_HASH = 'abc123def456';
const CLIENT_LATENCY = 42;
const EVENT_LOOP_LAG = 15;
const SCAN_DEPS_OUTPUT =
	'discord-player v6.7.0\n├── @discordjs/opus\n└── sodium-native';

const mockUseMainPlayer = vi.fn();
const mockGetCommitLink = vi.fn();

vi.mock('discord-player', () => ({
	useMainPlayer: mockUseMainPlayer,
}));

vi.mock('../utils/getCommitLink', () => ({
	default: mockGetCommitLink,
}));

let mockInteraction: ChatInputCommandInteraction;
let mockPlayer: {
	scanDeps: ReturnType<typeof vi.fn>;
	eventLoopLag: number;
};
let originalEnv: string | undefined;

beforeEach(() => {
	vi.clearAllMocks();
	originalEnv = process.env.GIT_COMMIT_SHA;

	mockPlayer = {
		scanDeps: vi.fn().mockReturnValue(SCAN_DEPS_OUTPUT),
		eventLoopLag: EVENT_LOOP_LAG,
	};

	mockUseMainPlayer.mockReturnValue(mockPlayer);

	mockInteraction = {
		client: {
			ws: {
				ping: CLIENT_LATENCY,
			} as WebSocketManager,
		},
		reply: vi.fn(),
	} as unknown as ChatInputCommandInteraction;
});

afterEach(() => {
	process.env.GIT_COMMIT_SHA = originalEnv;
	vi.resetModules();
});

it('should reply with debug information embed when commit hash is available', async () => {
	process.env.GIT_COMMIT_SHA = EXAMPLE_COMMIT_HASH;
	const { default: debugCommandHandler } = await import('../debug');

	await debugCommandHandler(mockInteraction);

	expect(mockInteraction.reply).toHaveBeenCalledWith({
		embeds: [expect.any(EmbedBuilder)],
		flags: ['Ephemeral'],
	});

	const embedCall = vi.mocked(mockInteraction.reply).mock
		.calls[0][0] as InteractionReplyOptions;
	const embed = embedCall.embeds?.[0] as EmbedBuilder;
	const embedData = embed.toJSON();

	expect(embedData.description).toBe(`\`\`\`\n${SCAN_DEPS_OUTPUT}\n\`\`\``);
	expect(embedData.fields).toHaveLength(3);

	if (embedData.fields) {
		expect(embedData.fields[0]).toEqual({
			name: 'Client Latency',
			value: `${CLIENT_LATENCY}ms`,
			inline: true,
		});
		expect(embedData.fields[1]).toEqual({
			name: 'Event Loop Lag',
			value: `${EVENT_LOOP_LAG}ms`,
			inline: true,
		});
		expect(embedData.fields[2]).toEqual({
			name: 'Release',
			value: `[\`${EXAMPLE_COMMIT_HASH}\`](<https://github.com/xxczaki/discord-bot/commit/${EXAMPLE_COMMIT_HASH}>)`,
			inline: true,
		});
	}

	expect(embedData.footer).toEqual({
		text: 'Event loop lag should be under 20ms',
		icon_url: undefined,
	});
});

it('should show N/A for release when deployment was manual', async () => {
	process.env.GIT_COMMIT_SHA = '';
	const { default: debugCommandHandler } = await import('../debug');

	await debugCommandHandler(mockInteraction);

	expect(mockInteraction.reply).toHaveBeenCalledWith({
		embeds: [expect.any(EmbedBuilder)],
		flags: ['Ephemeral'],
	});

	const embedCall = vi.mocked(mockInteraction.reply).mock
		.calls[0][0] as InteractionReplyOptions;
	const embed = embedCall.embeds?.[0] as EmbedBuilder;
	const embedData = embed.toJSON();

	if (embedData.fields) {
		expect(embedData.fields[2]).toEqual({
			name: 'Release',
			value: 'N/A',
			inline: true,
		});
	}

	expect(mockGetCommitLink).not.toHaveBeenCalled();
});

it('should format client latency without decimal places', async () => {
	const { default: debugCommandHandler } = await import('../debug');
	const highLatency = 123.456;
	mockInteraction = {
		...mockInteraction,
		client: {
			ws: {
				ping: highLatency,
			} as WebSocketManager,
		},
	} as unknown as ChatInputCommandInteraction;

	await debugCommandHandler(mockInteraction);

	const embedCall = vi.mocked(mockInteraction.reply).mock
		.calls[0][0] as InteractionReplyOptions;
	const embed = embedCall.embeds?.[0] as EmbedBuilder;
	const embedData = embed.toJSON();

	if (embedData.fields) {
		expect(embedData.fields[0].value).toBe('123ms');
	}
});

it('should include player scan dependencies in description', async () => {
	const { default: debugCommandHandler } = await import('../debug');
	const customScanOutput = 'custom scan output';
	mockPlayer.scanDeps.mockReturnValue(customScanOutput);

	await debugCommandHandler(mockInteraction);

	const embedCall = vi.mocked(mockInteraction.reply).mock
		.calls[0][0] as InteractionReplyOptions;
	const embed = embedCall.embeds?.[0] as EmbedBuilder;
	const embedData = embed.toJSON();

	expect(embedData.description).toBe(`\`\`\`\n${customScanOutput}\n\`\`\``);
	expect(mockPlayer.scanDeps).toHaveBeenCalledOnce();
});
