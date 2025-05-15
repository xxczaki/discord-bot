import { expect, it } from 'vitest';

import truncateString from '../truncateString';

it('should return the original string when it is shorter than the limit', () => {
	const result = truncateString('Hello', 10);
	expect(result).toBe('Hello');
});

it('should truncate the string and add an ellipsis when it exceeds the limit', () => {
	const result = truncateString('Hello World', 5);
	expect(result).toBe('Hello…');
});

it('should return an empty string when given an empty string', () => {
	const result = truncateString('', 5);
	expect(result).toBe('');
});

it('should return the original string when its length equals the limit', () => {
	const result = truncateString('Hello', 5);
	expect(result).toBe('Hello');
});

it('should return only an ellipsis when the limit is zero', () => {
	const result = truncateString('Hello', 0);
	expect(result).toBe('…');
});
