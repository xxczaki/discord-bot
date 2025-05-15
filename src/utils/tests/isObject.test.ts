import { expect, it } from 'vitest';
import isObject from '../isObject';

it('should return true for an empty object', () => {
	expect(isObject({})).toBe(true);
});

it('should return true for a non-empty object', () => {
	expect(isObject({ key: 'value' })).toBe(true);
});

it('should return false for null', () => {
	expect(isObject(null)).toBe(false);
});

it('should return false for undefined', () => {
	expect(isObject(undefined)).toBe(false);
});

it('should return false for primitive types', () => {
	expect(isObject(42)).toBe(false);
	expect(isObject('string')).toBe(false);
	expect(isObject(true)).toBe(false);
	expect(isObject(Symbol('test'))).toBe(false);
});

it('should return true for arrays', () => {
	expect(isObject([])).toBe(true);
	expect(isObject([1, 2, 3])).toBe(true);
});
