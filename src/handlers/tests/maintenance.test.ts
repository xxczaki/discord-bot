import { captureException } from '@sentry/node';
import type { ChatInputCommandInteraction } from 'discord.js';
import { beforeEach, expect, it, vi } from 'vitest';
import { DEPLOYMENT_NAME, DEPLOYMENT_NAMESPACE } from '../../utils/k8sClient';
import logger from '../../utils/logger';
import maintenanceCommandHandler from '../maintenance';

const mocks = vi.hoisted(() => {
	const OWNER_USER_ID = 'mock-owner-id';

	const mockApi = {
		deleteNamespacedDeployment: vi.fn(),
	};

	const mockKubeConfig = {
		loadFromCluster: vi.fn(),
		makeApiClient: vi.fn(() => mockApi),
	};

	return {
		OWNER_USER_ID,
		DIFFERENT_USER_ID: 'user456',
		mockApi,
		mockKubeConfig,
		KubeConfig: vi.fn(() => mockKubeConfig),
		AppsV1Api: vi.fn(),
	};
});

vi.mock('../../utils/k8sClient', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../utils/k8sClient')>();

	return {
		...actual,
		default: vi.fn(() => mocks.mockApi),
	};
});

const mockedCaptureException = vi.mocked(captureException);
const mockedLogger = vi.mocked(logger);

function createMockInteraction(): ChatInputCommandInteraction {
	return {
		reply: vi.fn().mockResolvedValue({}),
		editReply: vi.fn().mockResolvedValue({}),
	} as unknown as ChatInputCommandInteraction;
}

beforeEach(() => {
	vi.clearAllMocks();
});

it('should successfully delete deployment', async () => {
	const interaction = createMockInteraction();

	mocks.mockApi.deleteNamespacedDeployment.mockResolvedValue({});

	await maintenanceCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith(
		'🔧 Activating maintenance mode...',
	);
	expect(mocks.mockApi.deleteNamespacedDeployment).toHaveBeenCalledWith({
		name: DEPLOYMENT_NAME,
		namespace: DEPLOYMENT_NAMESPACE,
	});
	expect(interaction.editReply).toHaveBeenCalledWith(
		'✅ Maintenance mode activated! Bot will shut down in a few seconds...',
	);
	expect(mockedLogger.info).toHaveBeenCalledWith(
		{},
		'Maintenance mode activated, deleting deployment...',
	);
});

it('should handle Kubernetes API errors gracefully', async () => {
	const interaction = createMockInteraction();
	const apiError = new Error('Failed to connect to Kubernetes API');

	mocks.mockApi.deleteNamespacedDeployment.mockRejectedValue(apiError);

	await maintenanceCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith(
		'🔧 Activating maintenance mode...',
	);
	expect(mockedLogger.error).toHaveBeenCalledWith(
		apiError,
		'Failed to delete deployment for maintenance',
	);
	expect(mockedCaptureException).toHaveBeenCalledWith(apiError);
	expect(interaction.editReply).toHaveBeenCalledWith(
		'❌ Failed to activate maintenance mode. Please check the logs or try again later.',
	);
});

it('should handle non-Error exceptions', async () => {
	const interaction = createMockInteraction();
	const unknownError = 'Unknown error string';

	mocks.mockApi.deleteNamespacedDeployment.mockRejectedValue(unknownError);

	await maintenanceCommandHandler(interaction);

	expect(interaction.editReply).toHaveBeenCalledWith(
		'❌ Failed to activate maintenance mode. Please check the logs or try again later.',
	);
});
