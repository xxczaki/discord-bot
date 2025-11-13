import { describe, expect, it } from 'vitest';
import formatDuration from '../formatDuration';

describe('formatDuration', () => {
	it('should format seconds only when less than a minute', () => {
		expect(formatDuration(5000)).toBe('5s');
	});

	it('should format zero seconds', () => {
		expect(formatDuration(0)).toBe('0s');
	});

	it('should format exactly 1 minute', () => {
		expect(formatDuration(60000)).toBe('1:00');
	});

	it('should format minutes and seconds with padding', () => {
		expect(formatDuration(125000)).toBe('2:05');
	});

	it('should format minutes and seconds without padding when seconds >= 10', () => {
		expect(formatDuration(130000)).toBe('2:10');
	});

	it('should format large durations correctly', () => {
		expect(formatDuration(3661000)).toBe('61:01');
	});

	it('should handle milliseconds correctly by rounding down', () => {
		expect(formatDuration(5999)).toBe('5s');
	});

	it('should pad seconds with leading zero when needed', () => {
		expect(formatDuration(61000)).toBe('1:01');
	});

	it('should handle exactly 59 seconds', () => {
		expect(formatDuration(59000)).toBe('59s');
	});

	it('should handle 10 hours (600 minutes)', () => {
		expect(formatDuration(36000000)).toBe('600:00');
	});
});
