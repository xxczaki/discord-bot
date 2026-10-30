const HOUR_MS = 60 * 60 * 1000;

export class RateLimiter {
	static #instances = new Map<string, RateLimiter>();

	#callCount = 0;
	#lastResetMs = Date.now();
	readonly #maxCalls: number;
	readonly #resetIntervalHours: number;

	private constructor(maxCalls: number, resetIntervalHours: number) {
		this.#maxCalls = maxCalls;
		this.#resetIntervalHours = resetIntervalHours;
	}

	static getInstance(
		key: string,
		maxCalls = 100,
		resetIntervalHours = 24,
	): RateLimiter {
		let instance = RateLimiter.#instances.get(key);
		if (!instance) {
			instance = new RateLimiter(maxCalls, resetIntervalHours);
			RateLimiter.#instances.set(key, instance);
		}
		return instance;
	}

	canMakeCall(): boolean {
		this.#resetIfNeeded();
		return this.#callCount < this.#maxCalls;
	}

	incrementCall(): void {
		this.#resetIfNeeded();
		this.#callCount++;
	}

	getRemainingCalls(): number {
		this.#resetIfNeeded();
		return Math.max(0, this.#maxCalls - this.#callCount);
	}

	getTimeUntilReset(): number {
		return Math.max(0, this.#resetIntervalHours - this.#hoursSinceReset());
	}

	reset(): void {
		this.#callCount = 0;
		this.#lastResetMs = Date.now();
	}

	#hoursSinceReset(): number {
		return (Date.now() - this.#lastResetMs) / HOUR_MS;
	}

	#resetIfNeeded(): void {
		if (this.#hoursSinceReset() >= this.#resetIntervalHours) {
			this.reset();
		}
	}
}
