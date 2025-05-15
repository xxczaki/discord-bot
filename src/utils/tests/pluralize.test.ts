import { expect, it } from 'vitest';
import pluralize from '../pluralize';

it('should use singular form when count is 1', () => {
	const result = pluralize('item', 'items')`You have ${1} ${null} in your cart`;
	expect(result).toBe('You have 1 item in your cart');
});

it('should use plural form when count is 0', () => {
	const result = pluralize('item', 'items')`You have ${0} ${null} in your cart`;
	expect(result).toBe('You have 0 items in your cart');
});

it('should use plural form when count is greater than 1', () => {
	const result = pluralize('item', 'items')`You have ${5} ${null} in your cart`;
	expect(result).toBe('You have 5 items in your cart');
});

it('should handle multiple expressions in the template', () => {
	const result = pluralize('apple', 'apples')`${2} ${null} and ${1} orange`;
	expect(result).toBe('2 apples and 1 orange');
});

it('should throw error when no number is provided', () => {
	expect(() => {
		pluralize('item', 'items')`You have ${null} in your cart`;
	}).toThrow('Incorrect use of `pluralize`');
});

it('should handle negative numbers as plural', () => {
	const result = pluralize(
		'item',
		'items',
	)`You have ${-2} ${null} in your cart`;
	expect(result).toBe('You have -2 items in your cart');
});
