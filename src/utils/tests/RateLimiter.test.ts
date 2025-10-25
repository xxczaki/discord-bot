import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimiter } from '../RateLimiter';

describe('RateLimiter', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('should create a singleton instance per key', () => {
		const limiter1 = RateLimiter.getInstance('test-key-1');
		const limiter2 = RateLimiter.getInstance('test-key-1');
		const limiter3 = RateLimiter.getInstance('test-key-2');

		expect(limiter1).toBe(limiter2);
		expect(limiter1).not.toBe(limiter3);
	});

	it('should allow calls within the rate limit', () => {
		const limiter = RateLimiter.getInstance('test-allow', 5, 24);

		expect(limiter.canMakeCall()).toBe(true);
		expect(limiter.getRemainingCalls()).toBe(5);

		limiter.incrementCall();
		expect(limiter.canMakeCall()).toBe(true);
		expect(limiter.getRemainingCalls()).toBe(4);

		limiter.incrementCall();
		expect(limiter.getRemainingCalls()).toBe(3);
	});

	it('should block calls after reaching the limit', () => {
		const limiter = RateLimiter.getInstance('test-block', 3, 24);

		limiter.incrementCall();
		limiter.incrementCall();
		limiter.incrementCall();

		expect(limiter.canMakeCall()).toBe(false);
		expect(limiter.getRemainingCalls()).toBe(0);
	});

	it('should reset after the specified interval', () => {
		const limiter = RateLimiter.getInstance('test-reset', 3, 1); // 1 hour reset

		limiter.incrementCall();
		limiter.incrementCall();
		limiter.incrementCall();

		expect(limiter.canMakeCall()).toBe(false);

		// Advance time by 1 hour
		vi.advanceTimersByTime(60 * 60 * 1000);

		expect(limiter.canMakeCall()).toBe(true);
		expect(limiter.getRemainingCalls()).toBe(3);
	});

	it('should not reset before the interval', () => {
		const limiter = RateLimiter.getInstance('test-no-reset', 2, 24);

		limiter.incrementCall();
		limiter.incrementCall();

		expect(limiter.canMakeCall()).toBe(false);

		// Advance time by 23 hours (not enough to reset)
		vi.advanceTimersByTime(23 * 60 * 60 * 1000);

		expect(limiter.canMakeCall()).toBe(false);
		expect(limiter.getRemainingCalls()).toBe(0);
	});

	it('should manually reset the counter', () => {
		const limiter = RateLimiter.getInstance('test-manual-reset', 2, 24);

		limiter.incrementCall();
		limiter.incrementCall();

		expect(limiter.canMakeCall()).toBe(false);

		limiter.reset();

		expect(limiter.canMakeCall()).toBe(true);
		expect(limiter.getRemainingCalls()).toBe(2);
	});

	it('should calculate time until reset correctly', () => {
		const limiter = RateLimiter.getInstance('test-time', 5, 24);

		const timeUntilReset1 = limiter.getTimeUntilReset();
		expect(timeUntilReset1).toBeCloseTo(24, 1);

		// Advance time by 12 hours
		vi.advanceTimersByTime(12 * 60 * 60 * 1000);

		const timeUntilReset2 = limiter.getTimeUntilReset();
		expect(timeUntilReset2).toBeCloseTo(12, 1);
	});

	it('should return 0 time until reset after the interval', () => {
		const limiter = RateLimiter.getInstance('test-time-zero', 5, 1);

		// Advance time by 2 hours
		vi.advanceTimersByTime(2 * 60 * 60 * 1000);

		const timeUntilReset = limiter.getTimeUntilReset();
		expect(timeUntilReset).toBe(0);
	});

	it('should handle multiple increments correctly', () => {
		const limiter = RateLimiter.getInstance('test-multiple', 10, 24);

		for (let i = 0; i < 7; i++) {
			limiter.incrementCall();
		}

		expect(limiter.getRemainingCalls()).toBe(3);
		expect(limiter.canMakeCall()).toBe(true);

		limiter.incrementCall();
		limiter.incrementCall();
		limiter.incrementCall();

		expect(limiter.getRemainingCalls()).toBe(0);
		expect(limiter.canMakeCall()).toBe(false);
	});

	it('should use default parameters when not specified', () => {
		const limiter = RateLimiter.getInstance('test-defaults');

		// Default should be 100 calls per 24 hours
		expect(limiter.getRemainingCalls()).toBe(100);

		for (let i = 0; i < 100; i++) {
			limiter.incrementCall();
		}

		expect(limiter.canMakeCall()).toBe(false);
	});

	it('should handle edge case of 0 max calls', () => {
		const limiter = RateLimiter.getInstance('test-zero', 0, 24);

		expect(limiter.canMakeCall()).toBe(false);
		expect(limiter.getRemainingCalls()).toBe(0);
	});

	it('should maintain separate state for different keys', () => {
		const limiter1 = RateLimiter.getInstance('key-1', 3, 24);
		const limiter2 = RateLimiter.getInstance('key-2', 3, 24);

		limiter1.incrementCall();
		limiter1.incrementCall();

		expect(limiter1.getRemainingCalls()).toBe(1);
		expect(limiter2.getRemainingCalls()).toBe(3);

		limiter2.incrementCall();

		expect(limiter1.getRemainingCalls()).toBe(1);
		expect(limiter2.getRemainingCalls()).toBe(2);
	});
});
