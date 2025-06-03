import { captureException } from '@sentry/node';
import type { ChatInputCommandInteraction } from 'discord.js';
import { beforeEach, expect, it, vi } from 'vitest';
import logger from '../../utils/logger';
import maintenanceCommandHandler from '../maintenance';

const mocks = vi.hoisted(() => {
	const OWNER_USER_ID = 'mock-owner-id';

	const mockApi = {
		readNamespacedDeployment: vi.fn(),
		replaceNamespacedDeployment: vi.fn(),
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
		getEnvironmentVariable: vi.fn((key: string) => {
			if (key === 'OWNER_USER_ID') {
				return OWNER_USER_ID;
			}

			throw new TypeError(`Environment variable ${key} is not defined`);
		}),
	};
});

vi.mock('@kubernetes/client-node', () => ({
	KubeConfig: mocks.KubeConfig,
	AppsV1Api: mocks.AppsV1Api,
}));

vi.mock('../../utils/getEnvironmentVariable', () => ({
	default: mocks.getEnvironmentVariable,
}));

const mockedCaptureException = vi.mocked(captureException);
const mockedLogger = vi.mocked(logger);

function createMockInteraction(userId: string): ChatInputCommandInteraction {
	return {
		member: {
			user: {
				id: userId,
			},
		},
		reply: vi.fn().mockResolvedValue({}),
		editReply: vi.fn().mockResolvedValue({}),
	} as unknown as ChatInputCommandInteraction;
}

function createMockDeployment() {
	return {
		spec: {
			replicas: 1,
		},
	};
}

beforeEach(() => {
	vi.clearAllMocks();
});

it('should reject non-owner users with ephemeral message', async () => {
	const interaction = createMockInteraction(mocks.DIFFERENT_USER_ID);

	await maintenanceCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith({
		content: `Only <@!${mocks.OWNER_USER_ID}> is allowed to run this command.`,
		flags: ['Ephemeral'],
	});
	expect(interaction.editReply).not.toHaveBeenCalled();
});

it('should successfully scale down deployment for owner', async () => {
	const interaction = createMockInteraction(mocks.OWNER_USER_ID);
	const mockDeployment = createMockDeployment();

	mocks.mockApi.readNamespacedDeployment.mockResolvedValue(mockDeployment);
	mocks.mockApi.replaceNamespacedDeployment.mockResolvedValue({});

	await maintenanceCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith(
		'🔧 Activating maintenance mode...',
	);
	expect(mocks.mockKubeConfig.loadFromCluster).toHaveBeenCalled();
	expect(mocks.mockApi.readNamespacedDeployment).toHaveBeenCalledWith({
		name: 'discord-bot',
		namespace: 'discord-bot',
	});
	expect(mocks.mockApi.replaceNamespacedDeployment).toHaveBeenCalledWith({
		name: 'discord-bot',
		namespace: 'discord-bot',
		body: {
			...mockDeployment,
			spec: {
				...mockDeployment.spec,
				replicas: 0,
			},
		},
	});
	expect(interaction.editReply).toHaveBeenCalledWith(
		'✅ Maintenance mode activated! Bot scaled down to 0 replicas.',
	);
	expect(mockedLogger.info).toHaveBeenCalledWith(
		{},
		'Bot scaled down for maintenance',
	);
});

it('should handle missing deployment spec', async () => {
	const interaction = createMockInteraction(mocks.OWNER_USER_ID);
	const mockDeploymentWithoutSpec = {
		spec: null,
	};

	mocks.mockApi.readNamespacedDeployment.mockResolvedValue(
		mockDeploymentWithoutSpec,
	);

	await maintenanceCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith(
		'🔧 Activating maintenance mode...',
	);
	expect(interaction.editReply).toHaveBeenCalledWith(
		'❌ Failed to activate maintenance mode: Deployment spec is missing',
	);
	expect(mockedLogger.error).toHaveBeenCalledWith(
		{},
		'Deployment spec is missing',
	);
	expect(mocks.mockApi.replaceNamespacedDeployment).not.toHaveBeenCalled();
});

it('should handle Kubernetes API errors gracefully', async () => {
	const interaction = createMockInteraction(mocks.OWNER_USER_ID);
	const apiError = new Error('Failed to connect to Kubernetes API');

	mocks.mockApi.readNamespacedDeployment.mockRejectedValue(apiError);

	await maintenanceCommandHandler(interaction);

	expect(interaction.reply).toHaveBeenCalledWith(
		'🔧 Activating maintenance mode...',
	);
	expect(mockedLogger.error).toHaveBeenCalledWith(
		apiError,
		'Failed to scale down deployment for maintenance',
	);
	expect(mockedCaptureException).toHaveBeenCalledWith(apiError);
	expect(interaction.editReply).toHaveBeenCalledWith(
		`❌ Failed to activate maintenance mode: ${apiError.message}

Please check the logs or try again later.`,
	);
});

it('should handle non-Error exceptions', async () => {
	const interaction = createMockInteraction(mocks.OWNER_USER_ID);
	const unknownError = 'Unknown error string';

	mocks.mockApi.readNamespacedDeployment.mockRejectedValue(unknownError);

	await maintenanceCommandHandler(interaction);

	expect(interaction.editReply).toHaveBeenCalledWith(
		`❌ Failed to activate maintenance mode: Unknown error occurred

Please check the logs or try again later.`,
	);
});

it('should handle deployment replacement errors', async () => {
	const interaction = createMockInteraction(mocks.OWNER_USER_ID);
	const mockDeployment = createMockDeployment();
	const replaceError = new Error('Insufficient permissions');

	mocks.mockApi.readNamespacedDeployment.mockResolvedValue(mockDeployment);
	mocks.mockApi.replaceNamespacedDeployment.mockRejectedValue(replaceError);

	await maintenanceCommandHandler(interaction);

	expect(mocks.mockApi.readNamespacedDeployment).toHaveBeenCalled();
	expect(mocks.mockApi.replaceNamespacedDeployment).toHaveBeenCalled();
	expect(mockedLogger.error).toHaveBeenCalledWith(
		replaceError,
		'Failed to scale down deployment for maintenance',
	);
	expect(mockedCaptureException).toHaveBeenCalledWith(replaceError);
	expect(interaction.editReply).toHaveBeenCalledWith(
		`❌ Failed to activate maintenance mode: ${replaceError.message}

Please check the logs or try again later.`,
	);
});
