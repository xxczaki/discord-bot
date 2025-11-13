import { beforeEach, describe, expect, it, vi } from 'vitest';
import formatRelativeTime from '../formatRelativeTime';

describe('formatRelativeTime', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2024-01-01T12:00:00Z'));
	});

	it('should return "just now" for timestamps less than a minute ago', () => {
		const timestamp = Date.now() - 30 * 1000;
		expect(formatRelativeTime(timestamp)).toBe('just now');
	});

	it('should return "just now" for current timestamp', () => {
		const timestamp = Date.now();
		expect(formatRelativeTime(timestamp)).toBe('just now');
	});

	it('should return singular "1 minute ago" for exactly 1 minute', () => {
		const timestamp = Date.now() - 60 * 1000;
		expect(formatRelativeTime(timestamp)).toBe('1 minute ago');
	});

	it('should return plural "minutes ago" for multiple minutes', () => {
		const timestamp = Date.now() - 5 * 60 * 1000;
		expect(formatRelativeTime(timestamp)).toBe('5 minutes ago');
	});

	it('should return singular "1 hour ago" for exactly 1 hour', () => {
		const timestamp = Date.now() - 60 * 60 * 1000;
		expect(formatRelativeTime(timestamp)).toBe('1 hour ago');
	});

	it('should return plural "hours ago" for multiple hours', () => {
		const timestamp = Date.now() - 3 * 60 * 60 * 1000;
		expect(formatRelativeTime(timestamp)).toBe('3 hours ago');
	});

	it('should return singular "1 day ago" for exactly 1 day', () => {
		const timestamp = Date.now() - 24 * 60 * 60 * 1000;
		expect(formatRelativeTime(timestamp)).toBe('1 day ago');
	});

	it('should return plural "days ago" for multiple days', () => {
		const timestamp = Date.now() - 7 * 24 * 60 * 60 * 1000;
		expect(formatRelativeTime(timestamp)).toBe('7 days ago');
	});

	it('should round down minutes correctly', () => {
		const timestamp = Date.now() - 90 * 1000;
		expect(formatRelativeTime(timestamp)).toBe('1 minute ago');
	});

	it('should round down hours correctly', () => {
		const timestamp = Date.now() - 90 * 60 * 1000;
		expect(formatRelativeTime(timestamp)).toBe('1 hour ago');
	});

	it('should round down days correctly', () => {
		const timestamp = Date.now() - 36 * 60 * 60 * 1000;
		expect(formatRelativeTime(timestamp)).toBe('1 day ago');
	});
});
