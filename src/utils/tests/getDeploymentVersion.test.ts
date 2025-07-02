import { beforeEach, expect, it, vi } from 'vitest';
import getDeploymentVersion from '../getDeploymentVersion';
import { DEPLOYMENT_NAME, DEPLOYMENT_NAMESPACE } from '../k8sClient';

const mocks = vi.hoisted(() => {
	const mockApi = {
		readNamespacedDeployment: vi.fn(),
	};

	return {
		mockApi,
		createK8sClient: vi.fn(() => mockApi),
	};
});

vi.mock('../k8sClient', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../k8sClient')>();
	return {
		...actual,
		default: mocks.createK8sClient,
	};
});

beforeEach(() => {
	vi.clearAllMocks();
});

it('should return version from helm chart label', async () => {
	const mockDeployment = {
		metadata: {
			labels: {
				'helm.sh/chart': 'discord-bot-0.14.0',
			},
		},
	};

	mocks.mockApi.readNamespacedDeployment.mockResolvedValue(mockDeployment);
	const result = await getDeploymentVersion();

	expect(result).toBe('0.14.0');
	expect(mocks.mockApi.readNamespacedDeployment).toHaveBeenCalledWith({
		name: DEPLOYMENT_NAME,
		namespace: DEPLOYMENT_NAMESPACE,
	});
});

it('should return undefined when helm chart label is missing', async () => {
	const mockDeployment = {
		metadata: {
			labels: {},
		},
	};

	mocks.mockApi.readNamespacedDeployment.mockResolvedValue(mockDeployment);

	const result = await getDeploymentVersion();

	expect(result).toBeUndefined();
});

it('should return undefined when metadata is missing', async () => {
	const mockDeployment = {};

	mocks.mockApi.readNamespacedDeployment.mockResolvedValue(mockDeployment);

	const result = await getDeploymentVersion();

	expect(result).toBeUndefined();
});

it('should handle k8s API errors gracefully', async () => {
	const apiError = new Error('Failed to connect to Kubernetes API');

	mocks.mockApi.readNamespacedDeployment.mockRejectedValue(apiError);

	const result = await getDeploymentVersion();

	expect(result).toBeUndefined();
});
