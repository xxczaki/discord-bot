import { AudioFilters } from 'discord-player';
import { expect, it, vi } from 'vitest';
import defineCustomFilters from '../defineCustomFilters';

vi.mock('discord-player', () => ({
	AudioFilters: {
		defineBulk: vi.fn(),
	},
}));

it('should call defineBulk exactly once', () => {
	defineCustomFilters();
	expect(AudioFilters.defineBulk).toHaveBeenCalledTimes(1);
});
