import type { InteractionResponse, Message } from 'discord.js';
import type { GuildQueue, Track } from 'discord-player';
import { useMainPlayer } from 'discord-player';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import createSmartInteractionHandler from '../createSmartInteractionHandler';

vi.mock('discord-player', () => ({
	useMainPlayer: vi.fn(),
}));

vi.mock('../calculateSmartTimeout', () => ({
	default: vi.fn().mockReturnValue(30000),
}));

vi.mock('../getTrackPosition', () => ({
	default: vi.fn().mockReturnValue(0),
}));

const mockedUseMainPlayer = vi.mocked(useMainPlayer);

describe('createSmartInteractionHandler', () => {
	let mockPlayer: {
		events: {
			on: ReturnType<typeof vi.fn>;
			off: ReturnType<typeof vi.fn>;
		};
	};
	let mockResponse: {
		edit: ReturnType<typeof vi.fn>;
	};
	let mockQueue: GuildQueue<unknown>;
	let mockTrack: Track<unknown>;
	let mockGuild: { id: string };

	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();

		mockPlayer = {
			events: {
				on: vi.fn(),
				off: vi.fn(),
			},
		};

		mockResponse = {
			edit: vi.fn().mockResolvedValue(undefined),
		};

		mockGuild = { id: 'test-guild-id' };

		mockQueue = {
			guild: mockGuild,
			currentTrack: null,
			tracks: {
				some: vi.fn().mockReturnValue(false),
			},
			size: 0,
		} as unknown as GuildQueue<unknown>;

		mockTrack = {
			id: 'test-track-id',
		} as Track<unknown>;

		mockedUseMainPlayer.mockReturnValue(
			mockPlayer as unknown as ReturnType<typeof useMainPlayer>,
		);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	const getEventHandler = (eventName: string) => {
		return mockPlayer.events.on.mock.calls.find(
			([event]) => event === eventName,
		)?.[1];
	};

	const createDifferentGuildQueue = () =>
		({
			...mockQueue,
			guild: { id: 'different-guild-id' },
		}) as GuildQueue<unknown>;

	it('should register all event listeners on creation', () => {
		createSmartInteractionHandler({
			response: mockResponse as unknown as InteractionResponse<boolean>,
			queue: mockQueue,
			track: mockTrack,
		});

		expect(mockPlayer.events.on).toHaveBeenCalledWith(
			'playerStart',
			expect.any(Function),
		);
		expect(mockPlayer.events.on).toHaveBeenCalledWith(
			'playerSkip',
			expect.any(Function),
		);
		expect(mockPlayer.events.on).toHaveBeenCalledWith(
			'emptyQueue',
			expect.any(Function),
		);
		expect(mockPlayer.events.on).toHaveBeenCalledWith(
			'queueDelete',
			expect.any(Function),
		);
	});

	it('should return a handler object with cleanup function', () => {
		const handler = createSmartInteractionHandler({
			response: mockResponse as unknown as InteractionResponse<boolean>,
			queue: mockQueue,
			track: mockTrack,
		});

		expect(handler).toBeDefined();
		expect(typeof handler.cleanup).toBe('function');
		expect(handler).toHaveProperty('timeout');
	});

	it('should handle timeout with callbacks and cleanup', async () => {
		const onTimeout = vi.fn();

		createSmartInteractionHandler({
			response: mockResponse as unknown as InteractionResponse<boolean>,
			queue: mockQueue,
			track: mockTrack,
			onTimeout,
		});

		await vi.advanceTimersToNextTimerAsync();

		expect(onTimeout).toHaveBeenCalled();
		expect(mockResponse.edit).toHaveBeenCalledWith({ components: [] });

		expect(mockPlayer.events.off).toHaveBeenCalledWith(
			'playerStart',
			expect.any(Function),
		);
		expect(mockPlayer.events.off).toHaveBeenCalledWith(
			'playerSkip',
			expect.any(Function),
		);
		expect(mockPlayer.events.off).toHaveBeenCalledWith(
			'emptyQueue',
			expect.any(Function),
		);
		expect(mockPlayer.events.off).toHaveBeenCalledWith(
			'queueDelete',
			expect.any(Function),
		);
	});

	it('should work with Message response type', async () => {
		const onTimeout = vi.fn();

		createSmartInteractionHandler({
			response: mockResponse as unknown as Message<boolean>,
			queue: mockQueue,
			track: mockTrack,
			onTimeout,
		});

		await vi.advanceTimersToNextTimerAsync();

		expect(onTimeout).toHaveBeenCalled();
		expect(mockResponse.edit).toHaveBeenCalledWith({ components: [] });
	});

	it('should handle response.edit errors gracefully', async () => {
		mockResponse.edit.mockRejectedValue(new Error('Discord API error'));
		const onTimeout = vi.fn();

		createSmartInteractionHandler({
			response: mockResponse as unknown as InteractionResponse<boolean>,
			queue: mockQueue,
			track: mockTrack,
			onTimeout,
		});

		await vi.advanceTimersToNextTimerAsync();

		expect(onTimeout).toHaveBeenCalled();
		expect(mockResponse.edit).toHaveBeenCalledWith({ components: [] });
	});

	it.each([
		['playerStart', () => mockTrack],
		['playerSkip', () => mockTrack],
		['emptyQueue', () => undefined],
		['queueDelete', () => undefined],
	])('should ignore %s events from different guilds', async (eventName, getEventArgs) => {
		const onTrackChange = vi.fn();
		const onQueueEmpty = vi.fn();

		createSmartInteractionHandler({
			response: mockResponse as unknown as InteractionResponse<boolean>,
			queue: mockQueue,
			track: mockTrack,
			onTrackChange,
			onQueueEmpty,
		});

		const eventHandler = getEventHandler(eventName);
		const differentGuildQueue = createDifferentGuildQueue();
		const eventArgs = getEventArgs();

		if (eventArgs) {
			await eventHandler?.(differentGuildQueue, eventArgs);
		} else {
			await eventHandler?.(differentGuildQueue);
		}

		expect(onTrackChange).not.toHaveBeenCalled();
		expect(onQueueEmpty).not.toHaveBeenCalled();
	});

	describe('playerStart event handler', () => {
		it('should not trigger when same track starts in empty queue', async () => {
			const onTrackChange = vi.fn();
			const emptyQueue = { ...mockQueue, size: 0 } as GuildQueue<unknown>;

			createSmartInteractionHandler({
				response: mockResponse as unknown as InteractionResponse<boolean>,
				queue: mockQueue,
				track: mockTrack,
				onTrackChange,
			});

			const playerStartHandler = getEventHandler('playerStart');
			await playerStartHandler?.(emptyQueue, mockTrack);

			expect(onTrackChange).not.toHaveBeenCalled();
		});

		it('should trigger track change when different track starts and original track not in queue', async () => {
			const onTrackChange = vi.fn();
			const differentTrack = { id: 'different-track-id' } as Track<unknown>;

			mockQueue.tracks.some = vi.fn().mockReturnValue(false);

			createSmartInteractionHandler({
				response: mockResponse as unknown as InteractionResponse<boolean>,
				queue: mockQueue,
				track: mockTrack,
				onTrackChange,
			});

			const playerStartHandler = getEventHandler('playerStart');
			await playerStartHandler?.(mockQueue, differentTrack);

			expect(onTrackChange).toHaveBeenCalled();
			expect(mockResponse.edit).toHaveBeenCalledWith({ components: [] });
		});

		it('should not trigger when track is still in queue', async () => {
			const onTrackChange = vi.fn();
			const differentTrack = { id: 'different-track-id' } as Track<unknown>;

			mockQueue.tracks.some = vi.fn().mockReturnValue(true);

			createSmartInteractionHandler({
				response: mockResponse as unknown as InteractionResponse<boolean>,
				queue: mockQueue,
				track: mockTrack,
				onTrackChange,
			});

			const playerStartHandler = getEventHandler('playerStart');
			await playerStartHandler?.(mockQueue, differentTrack);

			expect(onTrackChange).not.toHaveBeenCalled();
		});
	});

	describe('playerSkip event handler', () => {
		it('should trigger track change when watched track is skipped', async () => {
			const onTrackChange = vi.fn();

			createSmartInteractionHandler({
				response: mockResponse as unknown as InteractionResponse<boolean>,
				queue: mockQueue,
				track: mockTrack,
				onTrackChange,
			});

			const playerSkipHandler = getEventHandler('playerSkip');
			await playerSkipHandler?.(mockQueue, mockTrack);

			expect(onTrackChange).toHaveBeenCalled();
			expect(mockResponse.edit).toHaveBeenCalledWith({ components: [] });
		});

		it('should not trigger when different track is skipped', async () => {
			const onTrackChange = vi.fn();
			const differentTrack = { id: 'different-track-id' } as Track<unknown>;

			createSmartInteractionHandler({
				response: mockResponse as unknown as InteractionResponse<boolean>,
				queue: mockQueue,
				track: mockTrack,
				onTrackChange,
			});

			const playerSkipHandler = getEventHandler('playerSkip');
			await playerSkipHandler?.(mockQueue, differentTrack);

			expect(onTrackChange).not.toHaveBeenCalled();
		});
	});

	it.each([
		'emptyQueue',
		'queueDelete',
	])('should trigger queue empty callback for %s event', async (eventName) => {
		const onQueueEmpty = vi.fn();

		createSmartInteractionHandler({
			response: mockResponse as unknown as InteractionResponse<boolean>,
			queue: mockQueue,
			track: mockTrack,
			onQueueEmpty,
		});

		const eventHandler = getEventHandler(eventName);
		await eventHandler?.(mockQueue);

		expect(onQueueEmpty).toHaveBeenCalled();
		expect(mockResponse.edit).toHaveBeenCalledWith({ components: [] });
	});

	describe('cleanup function', () => {
		it('should prevent cleanup from triggering multiple times', async () => {
			const onTimeout = vi.fn();
			const onTrackChange = vi.fn();

			createSmartInteractionHandler({
				response: mockResponse as unknown as InteractionResponse<boolean>,
				queue: mockQueue,
				track: mockTrack,
				onTimeout,
				onTrackChange,
			});

			const playerSkipHandler = getEventHandler('playerSkip');
			await playerSkipHandler?.(mockQueue, mockTrack);

			await vi.advanceTimersToNextTimerAsync();

			expect(onTrackChange).toHaveBeenCalledTimes(1);
			expect(onTimeout).not.toHaveBeenCalled();
			expect(mockResponse.edit).toHaveBeenCalledTimes(1);
		});
	});

	describe('edge cases', () => {
		it('should handle queue without guild', async () => {
			const queueWithoutGuild = {
				...mockQueue,
				guild: null,
			} as unknown as GuildQueue<unknown>;

			const handler = createSmartInteractionHandler({
				response: mockResponse as unknown as InteractionResponse<boolean>,
				queue: queueWithoutGuild,
				track: mockTrack,
			});

			expect(handler).toBeDefined();
			expect(typeof handler.cleanup).toBe('function');
		});

		it('should handle missing callbacks gracefully', async () => {
			createSmartInteractionHandler({
				response: mockResponse as unknown as InteractionResponse<boolean>,
				queue: mockQueue,
				track: mockTrack,
			});

			await vi.advanceTimersToNextTimerAsync();

			expect(mockResponse.edit).toHaveBeenCalledWith({ components: [] });
		});

		it('should detect when track is currently playing', () => {
			const currentTrack = { id: 'test-track-id' } as Track<unknown>;
			const queueWithCurrentTrack = {
				...mockQueue,
				currentTrack,
			} as GuildQueue<unknown>;

			const handler = createSmartInteractionHandler({
				response: mockResponse as unknown as InteractionResponse<boolean>,
				queue: queueWithCurrentTrack,
				track: mockTrack,
			});

			expect(handler).toBeDefined();
		});
	});
});
