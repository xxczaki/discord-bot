import { expect, it } from 'vitest';
import snakeToCamelCase from '../snakeToCamelCase';

it('should convert simple snake_case to camelCase', () => {
	expect(snakeToCamelCase('hello_world')).toBe('helloWorld');
});

it('should convert multiple words in snake_case to camelCase', () => {
	expect(snakeToCamelCase('this_is_a_long_variable_name')).toBe(
		'thisIsALongVariableName',
	);
});

it('should handle single word without underscores', () => {
	expect(snakeToCamelCase('hello')).toBe('hello');
});

it('should handle empty string', () => {
	expect(snakeToCamelCase('')).toBe('');
});

it('should handle string starting with underscore', () => {
	expect(snakeToCamelCase('_hello_world')).toBe('HelloWorld');
});

it('should handle consecutive underscores', () => {
	expect(snakeToCamelCase('xml_http_request')).toBe('xmlHttpRequest');
});

it('should handle single underscore with letter', () => {
	expect(snakeToCamelCase('_a')).toBe('A');
});
