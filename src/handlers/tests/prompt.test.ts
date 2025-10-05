import type { ChatInputCommandInteraction } from 'discord.js';
import type { Track } from 'discord-player';
import { useQueue } from 'discord-player';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import promptCommandHandler from '../prompt';

const EXAMPLE_TRACK_TITLE = 'Like a Rolling Stone';
const EXAMPLE_TRACK_AUTHOR = 'Bob Dylan';

vi.mock('discord-player', () => ({
	useQueue: vi.fn(),
}));

vi.mock('ai', () => ({
	generateText: vi.fn(),
	tool: vi.fn((config) => config),
}));

vi.mock('@ai-sdk/openai', () => ({
	openai: vi.fn(() => 'mock-model'),
}));

const mockedUseQueue = vi.mocked(useQueue);

beforeEach(() => {
	vi.clearAllMocks();
	process.env.OPENAI_API_KEY = 'test-api-key';
});

function createMockTrack(overrides: Partial<Track> = {}): Track {
	return {
		id: `track-${Date.now()}`,
		title: EXAMPLE_TRACK_TITLE,
		author: EXAMPLE_TRACK_AUTHOR,
		url: 'https://example.com/track',
		duration: '6:13',
		metadata: {},
		...overrides,
	} as Track;
}

function createMockInteraction(prompt: string): ChatInputCommandInteraction {
	return {
		options: {
			getString: vi.fn().mockReturnValue(prompt),
		},
		reply: vi.fn().mockResolvedValue({}),
		editReply: vi.fn().mockResolvedValue({}),
	} as unknown as ChatInputCommandInteraction;
}

function createMockQueue(
	tracks: Track[] = [],
): NonNullable<ReturnType<typeof useQueue>> {
	return {
		tracks: {
			toArray: vi.fn().mockReturnValue(tracks),
		},
		currentTrack: createMockTrack({ title: 'The Times They Are a-Changin' }),
		removeTrack: vi.fn(),
		moveTrack: vi.fn(),
	} as unknown as NonNullable<ReturnType<typeof useQueue>>;
}

describe('/prompt command', () => {
	it('should handle empty queue', async () => {
		const interaction = createMockInteraction('remove all bob dylan songs');
		mockedUseQueue.mockReturnValue(null);

		await promptCommandHandler(interaction);

		expect(interaction.reply).toHaveBeenCalledWith({
			content: 'The queue is empty. Cannot process prompt.',
			flags: ['Ephemeral'],
		});
	});

	it('should reply with initial processing message', async () => {
		const tracks = [
			createMockTrack(),
			createMockTrack({ title: 'Blowin in the Wind' }),
		];
		const mockQueue = createMockQueue(tracks);
		const interaction = createMockInteraction('show me the queue');

		mockedUseQueue.mockReturnValue(mockQueue);

		const { generateText } = await import('ai');
		vi.mocked(generateText).mockResolvedValue({} as never);

		await promptCommandHandler(interaction);

		expect(interaction.reply).toHaveBeenCalledWith('Processing your request…');
	});

	it('should handle rate limit exceeded', async () => {
		const tracks = [createMockTrack()];
		const mockQueue = createMockQueue(tracks);
		const interaction = createMockInteraction('remove all songs');

		mockedUseQueue.mockReturnValue(mockQueue);

		const RateLimiter = (await import('../prompt')) as unknown as {
			default: typeof promptCommandHandler;
		};

		for (let index = 0; index < 101; index++) {
			const testInteraction = createMockInteraction('test');
			mockedUseQueue.mockReturnValue(mockQueue);

			const { generateText } = await import('ai');
			vi.mocked(generateText).mockResolvedValue({} as never);

			await RateLimiter.default(testInteraction);
		}

		await promptCommandHandler(interaction);
	});
});
