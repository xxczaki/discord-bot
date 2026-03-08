import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import formatEndingTime from '../formatEndingTime';

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2025-03-08T20:00:00'));
});

afterEach(() => {
	vi.useRealTimers();
});

it('should return only the time when the end is on the same day', () => {
	const endTime = new Date('2025-03-08T23:45:00');
	const result = formatEndingTime(endTime);

	expect(result).toBe('23:45');
});

it('should append "(tomorrow)" when the end is the next calendar day', () => {
	const endTime = new Date('2025-03-09T01:30:00');
	const result = formatEndingTime(endTime);

	expect(result).toBe('01:30 (tomorrow)');
});

it('should append "(+N days)" when the end is 2 or more days away', () => {
	const endTime = new Date('2025-03-10T14:00:00');
	const result = formatEndingTime(endTime);

	expect(result).toBe('14:00 (+2 days)');
});

it('should handle 3+ day differences', () => {
	const endTime = new Date('2025-03-13T08:00:00');
	const result = formatEndingTime(endTime);

	expect(result).toBe('08:00 (+5 days)');
});
