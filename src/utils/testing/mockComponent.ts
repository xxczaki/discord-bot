import type { Message } from 'discord.js';
import { vi } from 'vitest';

export function createMockResponse(): Message {
	return {
		awaitMessageComponent: vi.fn(),
		delete: vi.fn().mockResolvedValue(undefined),
		edit: vi.fn(),
	} as unknown as Message;
}

export function createMockSelectMenuComponent(values: string[] = []) {
	return {
		isButton: () => false,
		isStringSelectMenu: () => true,
		values,
		reply: vi.fn().mockResolvedValue(undefined),
		editReply: vi.fn().mockResolvedValue(undefined),
	};
}

export function createMockButtonComponent() {
	return {
		isButton: () => true,
		isStringSelectMenu: () => false,
		values: [] as string[],
		reply: vi.fn().mockResolvedValue(undefined),
		editReply: vi.fn().mockResolvedValue(undefined),
	};
}
