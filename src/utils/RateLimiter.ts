/**
 * RateLimiter - Implements a daily rate limit counter
 * Reusable across different command handlers
 */
export class RateLimiter {
	private static instances = new Map<string, RateLimiter>();
	private callCount = 0;
	private lastReset: Date;

	private constructor(
		private readonly maxCalls: number,
		private readonly resetIntervalHours: number,
	) {
		this.lastReset = new Date();
	}

	/**
	 * Get or create a rate limiter instance with the given configuration
	 */
	static getInstance(
		key: string,
		maxCalls = 100,
		resetIntervalHours = 24,
	): RateLimiter {
		let instance = RateLimiter.instances.get(key);
		if (!instance) {
			instance = new RateLimiter(maxCalls, resetIntervalHours);
			RateLimiter.instances.set(key, instance);
		}
		return instance;
	}

	/**
	 * Check if a call can be made within the rate limit
	 */
	canMakeCall(): boolean {
		this.resetIfNeeded();
		return this.callCount < this.maxCalls;
	}

	/**
	 * Increment the call counter
	 */
	incrementCall(): void {
		this.resetIfNeeded();
		this.callCount++;
	}

	/**
	 * Get the number of remaining calls in the current period
	 */
	getRemainingCalls(): number {
		this.resetIfNeeded();
		return Math.max(0, this.maxCalls - this.callCount);
	}

	/**
	 * Get the time until the next reset
	 */
	getTimeUntilReset(): number {
		const now = new Date();
		const hoursSinceReset =
			(now.getTime() - this.lastReset.getTime()) / (1000 * 60 * 60);
		const hoursUntilReset = this.resetIntervalHours - hoursSinceReset;
		return Math.max(0, hoursUntilReset);
	}

	/**
	 * Manually reset the rate limiter (useful for testing)
	 */
	reset(): void {
		this.callCount = 0;
		this.lastReset = new Date();
	}

	private resetIfNeeded(): void {
		const now = new Date();
		const hoursSinceReset =
			(now.getTime() - this.lastReset.getTime()) / (1000 * 60 * 60);

		if (hoursSinceReset >= this.resetIntervalHours) {
			this.reset();
		}
	}
}
