import type { ChatInputCommandInteraction } from 'discord.js';
import { ActionRowBuilder } from 'discord.js';
import { beforeEach, expect, it, vi } from 'vitest';
import deployCommandHandler from '../deploy';

const mockGetArgoCdAppStatus = vi.hoisted(() => vi.fn());
const mockGetLatestChartVersion = vi.hoisted(() => vi.fn());
const mockTriggerArgoCdSync = vi.hoisted(() => vi.fn());
const mockUpdateArgoCdAppVersion = vi.hoisted(() => vi.fn());

vi.mock('../../utils/argoCdClient', () => ({
	getArgoCdAppStatus: mockGetArgoCdAppStatus,
	getLatestChartVersion: mockGetLatestChartVersion,
	triggerArgoCdSync: mockTriggerArgoCdSync,
	updateArgoCdAppVersion: mockUpdateArgoCdAppVersion,
}));

const createMockInteraction = (): ChatInputCommandInteraction => {
	const mockReply = vi.fn();
	const mockEditReply = vi.fn();
	const mockAwaitMessageComponent = vi.fn();

	return {
		user: { id: 'user123' },
		reply: mockReply,
		editReply: mockEditReply,
		replied: false,
		deferred: false,
		awaitMessageComponent: mockAwaitMessageComponent,
	} as unknown as ChatInputCommandInteraction;
};

const createMockResponse = () => ({
	awaitMessageComponent: vi.fn(),
});

beforeEach(() => {
	vi.clearAllMocks();
});

it('should handle deployment not available outside cluster', async () => {
	const mockInteraction = createMockInteraction();

	mockGetArgoCdAppStatus.mockResolvedValue(null);
	mockGetLatestChartVersion.mockResolvedValue('1.2.3');

	await deployCommandHandler(mockInteraction);

	expect(mockInteraction.reply).toHaveBeenCalledWith(
		'❌ Deployment sync is not available – running outside of cluster environment.',
	);
});

it('should handle failure to fetch latest chart version', async () => {
	const mockInteraction = createMockInteraction();

	mockGetArgoCdAppStatus.mockResolvedValue({
		syncStatus: 'Synced',
		healthStatus: 'Healthy',
		revision: 'abc123',
	});
	mockGetLatestChartVersion.mockResolvedValue(null);

	await deployCommandHandler(mockInteraction);

	expect(mockInteraction.reply).toHaveBeenCalledWith(
		'❌ Failed to fetch the latest chart version. Please try again later.',
	);
});

it('should display deployment status and confirmation buttons', async () => {
	const mockInteraction = createMockInteraction();
	const mockResponse = createMockResponse();

	mockGetArgoCdAppStatus.mockResolvedValue({
		syncStatus: 'Synced',
		healthStatus: 'Healthy',
		revision: 'abc123def456',
	});
	mockGetLatestChartVersion.mockResolvedValue('1.2.3');

	mockInteraction.reply = vi.fn().mockResolvedValue(mockResponse);

	await deployCommandHandler(mockInteraction);

	expect(mockInteraction.reply).toHaveBeenCalledWith({
		content:
			'🚀 **Deployment confirmation required**\nThis will update to chart version `1.2.3` and trigger an immediate Argo CD sync.',
		embeds: [
			{
				title: 'Deployment status',
				fields: [
					{
						name: 'Current chart version',
						value: 'abc123de',
						inline: true,
					},
					{
						name: 'Latest chart version',
						value: '1.2.3',
						inline: true,
					},
					{
						name: 'Sync status',
						value: 'Synced',
						inline: true,
					},
					{
						name: 'Health status',
						value: 'Healthy',
						inline: true,
					},
				],
				color: 0x00ff00,
			},
		],
		components: [expect.any(ActionRowBuilder)],
	});
});

it('should handle deployment cancellation', async () => {
	const mockInteraction = createMockInteraction();
	const mockResponse = createMockResponse();
	const mockButtonInteraction = {
		customId: 'deploy-cancel',
		user: { id: 'user123' },
		update: vi.fn(),
	};

	mockGetArgoCdAppStatus.mockResolvedValue({
		syncStatus: 'OutOfSync',
		healthStatus: 'Healthy',
		revision: 'abc123',
	});
	mockGetLatestChartVersion.mockResolvedValue('1.2.3');

	mockInteraction.reply = vi.fn().mockResolvedValue(mockResponse);
	mockResponse.awaitMessageComponent.mockResolvedValue(mockButtonInteraction);

	await deployCommandHandler(mockInteraction);

	expect(mockButtonInteraction.update).toHaveBeenCalledWith({
		content: '❌ Deployment cancelled.',
		embeds: [expect.any(Object)],
		components: [],
	});
});

it('should handle successful deployment', async () => {
	const mockInteraction = createMockInteraction();
	const mockResponse = createMockResponse();
	const mockButtonInteraction = {
		customId: 'deploy-confirm',
		user: { id: 'user123' },
		update: vi.fn(),
		editReply: vi.fn(),
	};

	mockGetArgoCdAppStatus
		.mockResolvedValueOnce({
			syncStatus: 'OutOfSync',
			healthStatus: 'Healthy',
			revision: 'abc123',
		})
		.mockResolvedValue({
			syncStatus: 'Synced',
			healthStatus: 'Healthy',
			revision: '1.2.3',
		});
	mockGetLatestChartVersion.mockResolvedValue('1.2.3');
	mockUpdateArgoCdAppVersion.mockResolvedValue(true);
	mockTriggerArgoCdSync.mockResolvedValue(true);

	mockInteraction.reply = vi.fn().mockResolvedValue(mockResponse);
	mockResponse.awaitMessageComponent.mockResolvedValue(mockButtonInteraction);

	vi.useFakeTimers();

	const promise = deployCommandHandler(mockInteraction);

	await vi.advanceTimersByTimeAsync(1000);
	await vi.advanceTimersByTimeAsync(5000);

	await promise;

	expect(mockButtonInteraction.update).toHaveBeenCalledWith({
		content:
			'🚀 **Deploying...** Updating chart version and triggering Argo CD sync...',
		embeds: [expect.any(Object)],
		components: [],
	});

	expect(mockUpdateArgoCdAppVersion).toHaveBeenCalledWith('1.2.3');
	expect(mockTriggerArgoCdSync).toHaveBeenCalled();

	vi.useRealTimers();
});

it('should handle deployment failure', async () => {
	const mockInteraction = createMockInteraction();
	const mockResponse = createMockResponse();
	const mockButtonInteraction = {
		customId: 'deploy-confirm',
		user: { id: 'user123' },
		update: vi.fn(),
		editReply: vi.fn(),
	};

	mockGetArgoCdAppStatus.mockResolvedValue({
		syncStatus: 'OutOfSync',
		healthStatus: 'Healthy',
		revision: 'abc123',
	});
	mockGetLatestChartVersion.mockResolvedValue('1.2.3');
	mockUpdateArgoCdAppVersion.mockResolvedValue(false);
	mockTriggerArgoCdSync.mockResolvedValue(false);

	mockInteraction.reply = vi.fn().mockResolvedValue(mockResponse);
	mockResponse.awaitMessageComponent.mockResolvedValue(mockButtonInteraction);

	await deployCommandHandler(mockInteraction);

	expect(mockButtonInteraction.editReply).toHaveBeenCalledWith({
		content:
			'❌ **Deployment failed.** Please check the logs or try again later.',
		embeds: [expect.any(Object)],
	});
});

it('should handle button interaction timeout', async () => {
	const mockInteraction = createMockInteraction();
	const mockResponse = createMockResponse();

	mockGetArgoCdAppStatus.mockResolvedValue({
		syncStatus: 'Synced',
		healthStatus: 'Healthy',
		revision: 'abc123',
	});
	mockGetLatestChartVersion.mockResolvedValue('1.2.3');

	mockInteraction.reply = vi.fn().mockResolvedValue(mockResponse);
	mockResponse.awaitMessageComponent.mockRejectedValue(new Error('Timeout'));

	await deployCommandHandler(mockInteraction);

	expect(mockInteraction.editReply).toHaveBeenCalledWith({
		content: '⏰ Deployment confirmation timed out.',
		embeds: [expect.any(Object)],
		components: [],
	});
});

it('should handle errors gracefully', async () => {
	const mockInteraction = createMockInteraction();

	mockGetArgoCdAppStatus.mockRejectedValue(new Error('Failed to get status'));

	await deployCommandHandler(mockInteraction);

	expect(mockInteraction.reply).toHaveBeenCalledWith(
		'❌ Failed to execute deployment sync. Please check the logs or try again later.',
	);
});

it('should not reply if interaction already replied or deferred', async () => {
	const mockInteraction = createMockInteraction();
	mockInteraction.replied = true;

	mockGetArgoCdAppStatus.mockRejectedValue(new Error('Failed to get status'));

	await deployCommandHandler(mockInteraction);

	expect(mockInteraction.reply).not.toHaveBeenCalled();
});
