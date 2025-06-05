import type { GuildQueue } from 'discord-player';
import type { InteractionResponse, Message } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS } from '../../constants/miscellaneous';
import createQueueAwareComponentHandler from '../createQueueAwareComponentHandler';

const mockPlayer = {
	events: {
		on: vi.fn(),
		off: vi.fn(),
	},
};

vi.mock('discord-player', () => ({
	useMainPlayer: () => mockPlayer,
}));

function getEventHandler(eventName: string) {
	const eventCall = mockPlayer.events.on.mock.calls.find(
		(call) => call[0] === eventName,
	);
	if (!eventCall) {
		throw new Error(`Event handler for ${eventName} not found`);
	}
	return eventCall[1];
}

describe('createQueueAwareComponentHandler', () => {
	let mockResponse: InteractionResponse<boolean>;
	let mockQueue: GuildQueue<unknown>;
	let mockOnQueueDestroyed: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();

		mockResponse = {
			edit: vi.fn().mockResolvedValue(undefined),
		} as unknown as InteractionResponse<boolean>;

		mockQueue = {
			guild: {
				id: 'test-guild-id',
			},
		} as unknown as GuildQueue<unknown>;

		mockOnQueueDestroyed = vi.fn();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('basic functionality', () => {
		it('should create handler and register event listeners', () => {
			const handler = createQueueAwareComponentHandler({
				response: mockResponse,
				queue: mockQueue,
				onQueueDestroyed: mockOnQueueDestroyed,
			});

			expect(mockPlayer.events.on).toHaveBeenCalledWith(
				'emptyQueue',
				expect.any(Function),
			);
			expect(mockPlayer.events.on).toHaveBeenCalledWith(
				'queueDelete',
				expect.any(Function),
			);
			expect(handler.cleanup).toEqual(expect.any(Function));
			expect(handler.timeout).toBe(DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS);
		});

		it('should use custom timeout when provided', () => {
			const customTimeout = 15000;

			const handler = createQueueAwareComponentHandler({
				response: mockResponse,
				queue: mockQueue,
				timeout: customTimeout,
			});

			expect(handler.timeout).toBe(customTimeout);
		});
	});

	describe('cleanup functionality', () => {
		it('should cleanup on timeout', async () => {
			createQueueAwareComponentHandler({
				response: mockResponse,
				queue: mockQueue,
				timeout: 1000,
			});

			await vi.advanceTimersByTimeAsync(1000);

			expect(mockPlayer.events.off).toHaveBeenCalledWith(
				'emptyQueue',
				expect.any(Function),
			);
			expect(mockPlayer.events.off).toHaveBeenCalledWith(
				'queueDelete',
				expect.any(Function),
			);
			expect(mockResponse.edit).toHaveBeenCalledWith({ components: [] });
		});

		it('should handle response.edit failure gracefully', async () => {
			mockResponse.edit = vi.fn().mockRejectedValue(new Error('Edit failed'));

			createQueueAwareComponentHandler({
				response: mockResponse,
				queue: mockQueue,
				timeout: 1000,
			});

			await vi.advanceTimersByTimeAsync(1000);

			expect(mockPlayer.events.off).toHaveBeenCalledWith(
				'emptyQueue',
				expect.any(Function),
			);
			expect(mockPlayer.events.off).toHaveBeenCalledWith(
				'queueDelete',
				expect.any(Function),
			);
		});

		it('should call onQueueDestroyed when cleanup reason is queue-destroyed', async () => {
			createQueueAwareComponentHandler({
				response: mockResponse,
				queue: mockQueue,
				onQueueDestroyed: mockOnQueueDestroyed,
			});

			const onEmptyQueue = getEventHandler('emptyQueue');
			await onEmptyQueue(mockQueue);

			expect(mockOnQueueDestroyed).toHaveBeenCalled();
		});

		it('should not cleanup twice', async () => {
			const handler = createQueueAwareComponentHandler({
				response: mockResponse,
				queue: mockQueue,
			});

			await handler.cleanup();
			await handler.cleanup();

			expect(mockResponse.edit).toHaveBeenCalledTimes(1);
		});
	});

	describe('emptyQueue event handling', () => {
		it('should trigger cleanup when emptyQueue event matches guild ID', async () => {
			createQueueAwareComponentHandler({
				response: mockResponse,
				queue: mockQueue,
				onQueueDestroyed: mockOnQueueDestroyed,
			});

			const onEmptyQueue = getEventHandler('emptyQueue');
			await onEmptyQueue(mockQueue);

			expect(mockPlayer.events.off).toHaveBeenCalledWith(
				'emptyQueue',
				expect.any(Function),
			);
			expect(mockPlayer.events.off).toHaveBeenCalledWith(
				'queueDelete',
				expect.any(Function),
			);
			expect(mockResponse.edit).toHaveBeenCalledWith({ components: [] });
			expect(mockOnQueueDestroyed).toHaveBeenCalled();
		});

		it('should ignore emptyQueue event when guild ID does not match', async () => {
			createQueueAwareComponentHandler({
				response: mockResponse,
				queue: mockQueue,
				onQueueDestroyed: mockOnQueueDestroyed,
			});

			const onEmptyQueue = getEventHandler('emptyQueue');
			const differentQueue = {
				guild: { id: 'different-guild-id' },
			} as unknown as GuildQueue<unknown>;

			await onEmptyQueue(differentQueue);

			expect(mockPlayer.events.off).not.toHaveBeenCalled();
			expect(mockResponse.edit).not.toHaveBeenCalled();
			expect(mockOnQueueDestroyed).not.toHaveBeenCalled();
		});
	});

	describe('queueDelete event handling', () => {
		it('should trigger cleanup when queueDelete event matches guild ID', async () => {
			createQueueAwareComponentHandler({
				response: mockResponse,
				queue: mockQueue,
				onQueueDestroyed: mockOnQueueDestroyed,
			});

			const onQueueDelete = getEventHandler('queueDelete');
			await onQueueDelete(mockQueue);

			expect(mockPlayer.events.off).toHaveBeenCalledWith(
				'emptyQueue',
				expect.any(Function),
			);
			expect(mockPlayer.events.off).toHaveBeenCalledWith(
				'queueDelete',
				expect.any(Function),
			);
			expect(mockResponse.edit).toHaveBeenCalledWith({ components: [] });
			expect(mockOnQueueDestroyed).toHaveBeenCalled();
		});

		it('should ignore queueDelete event when guild ID does not match', async () => {
			createQueueAwareComponentHandler({
				response: mockResponse,
				queue: mockQueue,
				onQueueDestroyed: mockOnQueueDestroyed,
			});

			const onQueueDelete = getEventHandler('queueDelete');
			const differentQueue = {
				guild: { id: 'different-guild-id' },
			} as unknown as GuildQueue<unknown>;

			await onQueueDelete(differentQueue);

			expect(mockPlayer.events.off).not.toHaveBeenCalled();
			expect(mockResponse.edit).not.toHaveBeenCalled();
			expect(mockOnQueueDestroyed).not.toHaveBeenCalled();
		});
	});

	describe('edge cases', () => {
		it('should work without onQueueDestroyed callback', async () => {
			createQueueAwareComponentHandler({
				response: mockResponse,
				queue: mockQueue,
			});

			const onEmptyQueue = getEventHandler('emptyQueue');
			await onEmptyQueue(mockQueue);

			expect(mockResponse.edit).toHaveBeenCalledWith({ components: [] });
		});

		it('should handle queue without guild', async () => {
			const queueWithoutGuild = {
				guild: null,
			} as unknown as GuildQueue<unknown>;

			createQueueAwareComponentHandler({
				response: mockResponse,
				queue: queueWithoutGuild,
			});

			const onEmptyQueue = getEventHandler('emptyQueue');
			await onEmptyQueue(mockQueue);

			expect(mockResponse.edit).not.toHaveBeenCalled();
		});

		it('should work with Message instead of InteractionResponse', () => {
			const mockMessage = {
				edit: vi.fn().mockResolvedValue(undefined),
			} as unknown as Message<boolean>;

			const handler = createQueueAwareComponentHandler({
				response: mockMessage,
				queue: mockQueue,
			});

			expect(handler.cleanup).toEqual(expect.any(Function));
		});
	});
});
