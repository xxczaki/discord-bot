import { expect, it } from 'vitest';
import { filterDisabledCommands, RAW_COMMANDS } from '../commands';

it('should exclude commands listed in the disabled set', () => {
	const commands = filterDisabledCommands(new Set(['maintenance', 'lockdown']));

	expect(RAW_COMMANDS.some((command) => command.name === 'maintenance')).toBe(
		true,
	);
	expect(commands.some((command) => command.name === 'maintenance')).toBe(
		false,
	);
	expect(commands.some((command) => command.name === 'lockdown')).toBe(false);
	expect(commands.some((command) => command.name === 'play')).toBe(true);
});

it('should return all commands when disabled set is empty', () => {
	const commands = filterDisabledCommands(new Set());

	expect(commands).toHaveLength(RAW_COMMANDS.length);
});
