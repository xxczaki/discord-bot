import type {
	ButtonInteraction,
	ChatInputCommandInteraction,
} from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ticTacToeCommandHandler, {
	EMPTY_CHARACTER,
	getAllPositions,
	getLabel,
	getOPositions,
	getPossiblePositions,
	getRows,
	getWinningSequences,
	isGameOverByWin,
	nextMove,
} from '../ticTacToe';

const WINNING_HORIZONTAL_TOP = ['0-0', '0-1', '0-2'];
const WINNING_DIAGONAL = ['0-0', '1-1', '2-2'];
const EXAMPLE_X_POSITIONS = ['0-0', '1-1'];
const EXAMPLE_O_POSITIONS = ['0-1', '2-2'];

const mockedRandomInt = vi.hoisted(() => vi.fn());

vi.mock('node:crypto', () => ({
	randomInt: mockedRandomInt,
}));

describe('getAllPositions', () => {
	it('should return all 9 positions for a 3x3 grid', () => {
		const positions = getAllPositions();

		expect(positions).toHaveLength(9);
		expect(positions).toEqual([
			'0-0',
			'0-1',
			'0-2',
			'1-0',
			'1-1',
			'1-2',
			'2-0',
			'2-1',
			'2-2',
		]);
	});
});

describe('getWinningSequences', () => {
	let sequences: string[][];

	beforeEach(() => {
		sequences = getWinningSequences();
	});

	it('should include horizontal winning sequences', () => {
		expect(sequences).toContainEqual(['0-0', '0-1', '0-2']);
		expect(sequences).toContainEqual(['1-0', '1-1', '1-2']);
		expect(sequences).toContainEqual(['2-0', '2-1', '2-2']);
	});

	it('should include vertical winning sequences', () => {
		expect(sequences).toContainEqual(['0-0', '1-0', '2-0']);
		expect(sequences).toContainEqual(['0-1', '1-1', '2-1']);
		expect(sequences).toContainEqual(['0-2', '1-2', '2-2']);
	});

	it('should include diagonal winning sequences', () => {
		expect(sequences).toContainEqual(['0-0', '1-1', '2-2']);
		expect(sequences).toContainEqual(['0-2', '1-1', '2-0']);
	});
});

describe('getLabel', () => {
	it('should return ❌ for X positions', () => {
		const label = getLabel('0-0', ['0-0'], []);

		expect(label).toBe('❌');
	});

	it('should return ⭕ for O positions', () => {
		const label = getLabel('1-1', [], ['1-1']);

		expect(label).toBe('⭕');
	});

	it('should return `EMPTY_CHARACTER` for empty positions', () => {
		const label = getLabel('2-2', ['0-0'], ['1-1']);

		expect(label).toBe(EMPTY_CHARACTER);
	});

	it('should prioritize X over O when position is in both arrays', () => {
		const label = getLabel('0-0', ['0-0'], ['0-0']);

		expect(label).toBe('❌');
	});
});

describe('getPossiblePositions', () => {
	it('should return all positions when no moves are made', () => {
		const positions = getPossiblePositions([], []);

		expect(positions).toHaveLength(9);
		expect(positions).toEqual(getAllPositions());
	});

	it('should exclude X and O positions', () => {
		const positions = getPossiblePositions(
			EXAMPLE_X_POSITIONS,
			EXAMPLE_O_POSITIONS,
		);

		expect(positions).toHaveLength(5);
		expect(positions).not.toContain('0-0');
		expect(positions).not.toContain('1-1');
		expect(positions).not.toContain('0-1');
		expect(positions).not.toContain('2-2');
	});

	it('should return empty array when all positions are taken', () => {
		const allPos = getAllPositions();
		const xPos = allPos.slice(0, 5);
		const oPos = allPos.slice(5);

		const positions = getPossiblePositions(xPos, oPos);

		expect(positions).toHaveLength(0);
	});
});

describe('isGameOverByWin', () => {
	it('should return false for positions array with less than 3 elements', () => {
		const result = isGameOverByWin(['0-0', '1-1']);

		expect(result).toBe(false);
	});

	it('should return winning sequence for horizontal win', () => {
		const result = isGameOverByWin(WINNING_HORIZONTAL_TOP);

		expect(result).toEqual(WINNING_HORIZONTAL_TOP);
	});

	it('should return winning sequence for diagonal win', () => {
		const result = isGameOverByWin(WINNING_DIAGONAL);

		expect(result).toEqual(WINNING_DIAGONAL);
	});

	it('should return undefined for non-winning positions', () => {
		const result = isGameOverByWin(['0-0', '1-1', '0-2']);

		expect(result).toBeUndefined();
	});

	it('should detect win even with extra positions', () => {
		const positions = [...WINNING_DIAGONAL, '0-1', '2-1'];
		const result = isGameOverByWin(positions);

		// Should detect the vertical win in middle column
		expect(result).toEqual(['0-1', '1-1', '2-1']);
	});
});

describe('getOPositions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should choose winning move when available', async () => {
		// Set up a scenario where O can win by completing '0-0'
		const xPositions = ['1-0', '2-1'];
		const oPositions = ['0-1', '0-2'];

		const result = await getOPositions(xPositions, oPositions);

		expect(result).toContain('0-0');
		expect(result).toHaveLength(3);
	});

	it('should add random position when no winning move exists', async () => {
		mockedRandomInt.mockReturnValue(0);
		const xPositions = ['0-0'];
		const oPositions = ['1-1'];

		const result = await getOPositions(xPositions, oPositions);

		expect(result).toHaveLength(2);
		expect(result).toContain('1-1');
		expect(mockedRandomInt).toHaveBeenCalledWith(0, 6);
	});

	it('should preserve existing O positions', async () => {
		mockedRandomInt.mockReturnValue(2);
		const xPositions = ['0-0'];
		const oPositions = ['1-1', '2-2'];

		const result = await getOPositions(xPositions, oPositions);

		expect(result).toContain('1-1');
		expect(result).toContain('2-2');
		expect(result).toHaveLength(3);
	});
});

describe('getRows', () => {
	it('should create 3 rows with 3 buttons each', async () => {
		const rows = await getRows([], []);

		expect(rows).toHaveLength(3);
		for (const row of rows) {
			expect(row.components).toHaveLength(3);
		}
	});

	it('should set correct labels and disabled states', async () => {
		const xPositions = ['0-0', '1-1'];
		const oPositions = ['0-1', '2-2'];
		const rows = await getRows(xPositions, oPositions);

		// Check that X and O positions are disabled and have correct labels
		const topRowButtons = rows[0].components;
		const button0 = topRowButtons[0].toJSON() as {
			label: string;
			disabled: boolean;
		};
		const button1 = topRowButtons[1].toJSON() as {
			label: string;
			disabled: boolean;
		};
		const button2 = topRowButtons[2].toJSON() as {
			label: string;
			disabled: boolean;
		};

		expect(button0.label).toBe('❌');
		expect(button0.disabled).toBe(true);
		expect(button1.label).toBe('⭕');
		expect(button1.disabled).toBe(true);
		expect(button2.label).toBe(EMPTY_CHARACTER);
		expect(button2.disabled).toBe(false);
	});

	it('should assign correct custom IDs to buttons', async () => {
		const rows = await getRows([], []);

		const button00 = rows[0].components[0].toJSON() as { custom_id: string };
		const button01 = rows[0].components[1].toJSON() as { custom_id: string };
		const button02 = rows[0].components[2].toJSON() as { custom_id: string };
		const button10 = rows[1].components[0].toJSON() as { custom_id: string };
		const button22 = rows[2].components[2].toJSON() as { custom_id: string };

		expect(button00.custom_id).toBe('0-0');
		expect(button01.custom_id).toBe('0-1');
		expect(button02.custom_id).toBe('0-2');
		expect(button10.custom_id).toBe('1-0');
		expect(button22.custom_id).toBe('2-2');
	});
});

describe('nextMove', () => {
	let mockUpdate: ReturnType<typeof vi.fn>;
	let mockEditReply: ReturnType<typeof vi.fn>;
	let mockAwaitMessageComponent: ReturnType<typeof vi.fn>;
	let mockInteraction: ButtonInteraction;

	beforeEach(() => {
		vi.clearAllMocks();
		mockUpdate = vi.fn();
		mockEditReply = vi.fn();
		mockAwaitMessageComponent = vi.fn();

		mockUpdate.mockResolvedValue({
			awaitMessageComponent: mockAwaitMessageComponent,
		});

		mockInteraction = {
			update: mockUpdate,
			editReply: mockEditReply,
		} as unknown as ButtonInteraction;
	});

	it('should handle player win scenario', async () => {
		const xPositions = WINNING_HORIZONTAL_TOP;
		const oPositions = ['1-1'];

		await nextMove(mockInteraction, xPositions, oPositions);

		expect(mockUpdate).toHaveBeenCalledWith({
			content: 'Game over, you won – congrats!',
			components: [],
		});
	});

	it('should handle draw scenario when no moves available', async () => {
		// X O X
		// X O O
		// O X X
		const xPositions = ['0-0', '0-2', '1-0', '2-1', '2-2'];
		const oPositions = ['0-1', '1-1', '1-2', '2-0'];

		await nextMove(mockInteraction, xPositions, oPositions);

		expect(mockUpdate).toHaveBeenCalledWith({
			content: 'Game over, draw.',
			components: [],
		});
	});

	it('should handle AI win scenario', async () => {
		const xPositions = ['1-0', '2-1'];
		const oPositions = ['0-1', '0-2'];

		await nextMove(mockInteraction, xPositions, oPositions);

		expect(mockUpdate).toHaveBeenCalledWith({
			content: 'Game over, I won – you fucking loser.',
			components: [],
		});
	});

	it('should continue game and set up next turn', async () => {
		mockedRandomInt.mockReturnValue(0);
		const xPositions = ['0-0'];
		const oPositions = ['1-1'];

		mockAwaitMessageComponent.mockResolvedValue({
			isButton: () => true,
			customId: '0-1',
		});

		const mockNextMove = vi.fn();

		vi.doMock('../ticTacToe', () => ({
			...vi.importActual('../ticTacToe'),
			nextMove: mockNextMove,
		}));

		await nextMove(mockInteraction, xPositions, oPositions);

		expect(mockUpdate).toHaveBeenCalledWith({
			content:
				'I made my move, your turn again. Choose where to place your `❌`:',
			components: expect.any(Array),
		});
	});

	it('should handle timeout during game continuation', async () => {
		mockedRandomInt.mockReturnValue(0);
		const xPositions = ['0-0'];
		const oPositions = ['1-1'];

		mockAwaitMessageComponent.mockRejectedValue(new Error('timeout'));

		await nextMove(mockInteraction, xPositions, oPositions);

		expect(mockUpdate).toHaveBeenCalledWith({
			content:
				'I made my move, your turn again. Choose where to place your `❌`:',
			components: expect.any(Array),
		});

		expect(mockEditReply).toHaveBeenCalledWith({
			components: [],
		});
	});

	it('should handle non-button interaction response', async () => {
		mockedRandomInt.mockReturnValue(0);
		const xPositions = ['0-0'];
		const oPositions = ['1-1'];

		mockAwaitMessageComponent.mockResolvedValue({
			isButton: () => false,
		});

		await nextMove(mockInteraction, xPositions, oPositions);

		expect(mockUpdate).toHaveBeenCalledWith({
			content:
				'I made my move, your turn again. Choose where to place your `❌`:',
			components: expect.any(Array),
		});

		expect(mockEditReply).not.toHaveBeenCalled();
	});
});

describe('ticTacToeCommandHandler integration', () => {
	it('should start game with initial state', async () => {
		const mockAwaitMessageComponent = vi
			.fn()
			.mockRejectedValue(new Error('timeout'));
		const mockReply = vi.fn().mockResolvedValue({
			awaitMessageComponent: mockAwaitMessageComponent,
		});
		const mockEditReply = vi.fn();

		const mockInteraction = {
			reply: mockReply,
			editReply: mockEditReply,
		} as unknown as ChatInputCommandInteraction;

		await ticTacToeCommandHandler(mockInteraction);

		expect(mockReply).toHaveBeenCalledWith({
			content:
				"The game begins and it's your turn. Choose where to place your symbol:",
			components: expect.any(Array),
			flags: ['Ephemeral'],
		});

		expect(mockEditReply).toHaveBeenCalledWith({
			components: [],
		});
	});
});
