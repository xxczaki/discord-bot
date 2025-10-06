import { describe, expect, it } from 'vitest';
import {
	generateErrorMessage,
	generatePendingMessage,
	generateSuccessMessage,
	type ToolResult,
} from '../promptTools';

describe('promptToolMessages', () => {
	describe('generatePendingMessage', () => {
		it('should return pending message for moveTracksByPattern', () => {
			expect(generatePendingMessage('moveTracksByPattern')).toBe(
				'Moving tracks…',
			);
		});

		it('should return pending message for removeTracksByPattern', () => {
			expect(generatePendingMessage('removeTracksByPattern')).toBe(
				'Removing tracks…',
			);
		});

		it('should return pending message for skipCurrentTrack', () => {
			expect(generatePendingMessage('skipCurrentTrack')).toBe(
				'Skipping track…',
			);
		});

		it('should return default message for unknown tool', () => {
			expect(generatePendingMessage('unknownTool')).toBe('unknownTool…');
		});
	});

	describe('generateSuccessMessage - moveTracksByPattern', () => {
		it('should generate message for moving single track', () => {
			const result: ToolResult = {
				success: true,
				movedCount: 1,
			};

			expect(generateSuccessMessage('moveTracksByPattern', result)).toBe(
				'Moved 1 track to front',
			);
		});

		it('should generate message for moving multiple tracks', () => {
			const result: ToolResult = {
				success: true,
				movedCount: 5,
			};

			expect(generateSuccessMessage('moveTracksByPattern', result)).toBe(
				'Moved 5 tracks to front',
			);
		});

		it('should handle missing movedCount', () => {
			const result: ToolResult = {
				success: true,
			};

			expect(generateSuccessMessage('moveTracksByPattern', result)).toBe(
				'Moved 0 tracks to front',
			);
		});
	});

	describe('generateSuccessMessage - removeTracksByPattern', () => {
		it('should generate message for removing single track', () => {
			const result: ToolResult = {
				success: true,
				removedCount: 1,
			};

			expect(generateSuccessMessage('removeTracksByPattern', result)).toBe(
				'Removed 1 track',
			);
		});

		it('should generate message for removing multiple tracks', () => {
			const result: ToolResult = {
				success: true,
				removedCount: 7,
			};

			expect(generateSuccessMessage('removeTracksByPattern', result)).toBe(
				'Removed 7 tracks',
			);
		});

		it('should handle missing removedCount', () => {
			const result: ToolResult = {
				success: true,
			};

			expect(generateSuccessMessage('removeTracksByPattern', result)).toBe(
				'Removed 0 tracks',
			);
		});
	});

	describe('generateSuccessMessage - skipCurrentTrack', () => {
		it('should generate message for skipping track', () => {
			const result: ToolResult = {
				success: true,
			};

			expect(generateSuccessMessage('skipCurrentTrack', result)).toBe(
				'Skipped current track',
			);
		});
	});

	describe('generateSuccessMessage - unknown tool', () => {
		it('should return default success message', () => {
			const result: ToolResult = {
				success: true,
			};

			expect(generateSuccessMessage('unknownTool', result)).toBe(
				'unknownTool completed',
			);
		});
	});

	describe('generateErrorMessage', () => {
		it('should extract error message from result', () => {
			const result: ToolResult = {
				success: false,
				error: 'No tracks found matching the criteria',
			};

			expect(generateErrorMessage('removeTracksByPattern', result)).toBe(
				'Failed: No tracks found matching the criteria',
			);
		});

		it('should return default error message when no error field', () => {
			const result: ToolResult = {
				success: false,
			};

			expect(generateErrorMessage('removeTracksByPattern', result)).toBe(
				'Operation failed',
			);
		});

		it('should return default for unknown tool', () => {
			const result: ToolResult = {
				success: false,
			};

			expect(generateErrorMessage('unknownTool', result)).toBe(
				'Operation failed',
			);
		});
	});
});
