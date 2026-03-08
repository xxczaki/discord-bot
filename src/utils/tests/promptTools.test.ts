import type { Tool } from 'ai';
import type { GuildQueue } from 'discord-player';
import { expect, it, vi } from 'vitest';
import {
	generatePendingMessage,
	generateSuccessMessage,
	generateSystemPrompt,
	getAvailableTools,
	getToolMessages,
	type ToolContext,
} from '../promptTools';
import {
	deduplicateQueue,
	moveTracksByPattern,
	pausePlayback,
	removeTracksByPattern,
	resumePlayback,
	setVolume,
	skipCurrentTrack,
} from '../queueOperations';

vi.mock('../queueOperations', () => ({
	removeTracksByPattern: vi.fn().mockReturnValue({
		success: true,
		removedCount: 3,
	}),
	moveTracksByPattern: vi.fn().mockReturnValue({
		success: true,
		movedCount: 2,
	}),
	skipCurrentTrack: vi.fn().mockReturnValue({ success: true }),
	pausePlayback: vi.fn().mockReturnValue({ success: true, wasPaused: false }),
	resumePlayback: vi.fn().mockReturnValue({ success: true }),
	setVolume: vi.fn().mockReturnValue({ success: true, volume: 50 }),
	deduplicateQueue: vi.fn().mockReturnValue({
		success: true,
		removedCount: 1,
	}),
}));

const mockQueue = {
	node: { skip: vi.fn() },
} as unknown as GuildQueue;

const mockContext: ToolContext = {
	queue: mockQueue,
	currentTrackTitle: 'Test Song',
	currentTrackAuthor: 'Test Artist',
	trackCount: 5,
};

function executeTool(tool: Tool, input: Record<string, unknown>) {
	// biome-ignore lint/style/noNonNullAssertion: every tool in the registry defines execute
	return tool.execute!(input, {
		toolCallId: 'test',
		messages: [],
		abortSignal: AbortSignal.timeout(5000),
	});
}

it('should return all available tools', () => {
	const tools = getAvailableTools(mockContext);

	expect(Object.keys(tools)).toEqual([
		'removeTracksByPattern',
		'moveTracksByPattern',
		'skipCurrentTrack',
		'pausePlayback',
		'resumePlayback',
		'setVolume',
		'deduplicateQueue',
	]);
});

it('should return tool messages for known tools', () => {
	expect(getToolMessages('removeTracksByPattern')).toBeDefined();
	expect(getToolMessages('unknown')).toBeUndefined();
});

it('should generate pending messages', () => {
	expect(generatePendingMessage('removeTracksByPattern')).toBe(
		'Removing tracks…',
	);
	expect(generatePendingMessage('skipCurrentTrack')).toBe('Skipping track…');
	expect(generatePendingMessage('unknownTool')).toBe('unknownTool…');
});

it('should generate success messages', () => {
	expect(
		generateSuccessMessage('removeTracksByPattern', { removedCount: 3 }),
	).toBe('Removed 3 tracks');

	expect(generateSuccessMessage('moveTracksByPattern', { movedCount: 1 })).toBe(
		'Moved 1 track to front',
	);

	expect(generateSuccessMessage('skipCurrentTrack', {})).toBe(
		'Skipped current track',
	);

	expect(generateSuccessMessage('pausePlayback', { wasPaused: true })).toBe(
		'Playback was already paused',
	);

	expect(generateSuccessMessage('pausePlayback', { wasPaused: false })).toBe(
		'Paused playback',
	);

	expect(generateSuccessMessage('resumePlayback', {})).toBe('Resumed playback');

	expect(generateSuccessMessage('setVolume', { volume: 75 })).toBe(
		'Set volume to 75',
	);

	expect(generateSuccessMessage('deduplicateQueue', { removedCount: 0 })).toBe(
		'No duplicates found',
	);

	expect(generateSuccessMessage('deduplicateQueue', { removedCount: 2 })).toBe(
		'Removed 2 duplicates',
	);

	expect(generateSuccessMessage('unknownTool', {})).toBe(
		'unknownTool completed',
	);

	expect(generateSuccessMessage('removeTracksByPattern', {})).toBe(
		'Removed 0 tracks',
	);

	expect(generateSuccessMessage('moveTracksByPattern', {})).toBe(
		'Moved 0 tracks to front',
	);

	expect(generateSuccessMessage('deduplicateQueue', {})).toBe(
		'No duplicates found',
	);
});

it('should generate system prompt with context', () => {
	const prompt = generateSystemPrompt(mockContext);

	expect(prompt).toContain('5 tracks');
	expect(prompt).toContain('"Test Song"');
	expect(prompt).toContain('Test Artist');
});

it('should execute `removeTracksByPattern` tool', async () => {
	const tools = getAvailableTools(mockContext);
	const result = await executeTool(tools.removeTracksByPattern, {
		artistPattern: 'Artist',
		titlePattern: null,
	});

	expect(removeTracksByPattern).toHaveBeenCalledWith(
		mockQueue,
		'Artist',
		undefined,
	);
	expect(result).toEqual({ success: true, removedCount: 3 });
});

it('should execute `moveTracksByPattern` tool', async () => {
	const tools = getAvailableTools(mockContext);
	const result = await executeTool(tools.moveTracksByPattern, {
		artistPattern: 'Artist',
		titlePattern: null,
		position: 0,
	});

	expect(moveTracksByPattern).toHaveBeenCalledWith(
		mockQueue,
		'Artist',
		undefined,
		0,
	);
	expect(result).toEqual({ success: true, movedCount: 2 });
});

it('should execute `skipCurrentTrack` tool', async () => {
	const tools = getAvailableTools(mockContext);
	const result = await executeTool(tools.skipCurrentTrack, {});

	expect(skipCurrentTrack).toHaveBeenCalledWith(mockQueue);
	expect(result).toEqual({ success: true });
});

it('should execute `pausePlayback` tool', async () => {
	const tools = getAvailableTools(mockContext);
	const result = await executeTool(tools.pausePlayback, {});

	expect(pausePlayback).toHaveBeenCalledWith(mockQueue);
	expect(result).toEqual({ success: true, wasPaused: false });
});

it('should execute `resumePlayback` tool', async () => {
	const tools = getAvailableTools(mockContext);
	const result = await executeTool(tools.resumePlayback, {});

	expect(resumePlayback).toHaveBeenCalledWith(mockQueue);
	expect(result).toEqual({ success: true });
});

it('should execute `setVolume` tool', async () => {
	const tools = getAvailableTools(mockContext);
	const result = await executeTool(tools.setVolume, { volume: 50 });

	expect(setVolume).toHaveBeenCalledWith(mockQueue, 50);
	expect(result).toEqual({ success: true, volume: 50 });
});

it('should execute `deduplicateQueue` tool', async () => {
	const tools = getAvailableTools(mockContext);
	const result = await executeTool(tools.deduplicateQueue, {});

	expect(deduplicateQueue).toHaveBeenCalledWith(mockQueue);
	expect(result).toEqual({ success: true, removedCount: 1 });
});
