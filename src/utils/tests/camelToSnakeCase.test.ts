import { expect, it } from 'vitest';
import camelToSnakeCase from '../camelToSnakeCase';

it('should convert simple camelCase to snake_case', () => {
	expect(camelToSnakeCase('helloWorld')).toBe('hello_world');
});

it('should convert multiple words in camelCase to snake_case', () => {
	expect(camelToSnakeCase('thisIsALongVariableName')).toBe(
		'this_is_a_long_variable_name',
	);
});

it('should handle single word without uppercase letters', () => {
	expect(camelToSnakeCase('hello')).toBe('hello');
});

it('should handle empty string', () => {
	expect(camelToSnakeCase('')).toBe('');
});

it('should handle string starting with uppercase letter', () => {
	expect(camelToSnakeCase('HelloWorld')).toBe('_hello_world');
});

it('should handle consecutive uppercase letters', () => {
	expect(camelToSnakeCase('XMLHttpRequest')).toBe('_x_m_l_http_request');
});

it('should handle single uppercase letter', () => {
	expect(camelToSnakeCase('A')).toBe('_a');
});
