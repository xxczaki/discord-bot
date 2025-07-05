import type * as k8s from '@kubernetes/client-node';
import { beforeEach, expect, it, vi } from 'vitest';
import createK8sClient from '../k8sClient';

const mockMakeApiClient = vi.fn();
const mockLoadFromCluster = vi.fn();

vi.mock('@kubernetes/client-node', () => ({
	KubeConfig: vi.fn(() => ({
		loadFromCluster: mockLoadFromCluster,
		makeApiClient: mockMakeApiClient,
	})),
	AppsV1Api: vi.fn(),
}));

vi.mock('../k8sClient', () => ({
	default: vi.fn(),
	DEPLOYMENT_NAME: 'discord-bot',
	DEPLOYMENT_NAMESPACE: 'discord-bot',
}));

const mockedCreateK8sClient = vi.mocked(createK8sClient);

beforeEach(() => {
	vi.clearAllMocks();
});

it('should create and return new k8s client on first call', () => {
	const mockClient = {} as k8s.AppsV1Api;
	mockMakeApiClient.mockReturnValue(mockClient);
	mockedCreateK8sClient.mockReturnValue(mockClient);

	const client = createK8sClient();

	expect(mockedCreateK8sClient).toHaveBeenCalledTimes(1);
	expect(client).toBe(mockClient);
});

it('should return existing client on subsequent calls', () => {
	const mockClient = {} as k8s.AppsV1Api;
	mockMakeApiClient.mockReturnValue(mockClient);
	mockedCreateK8sClient.mockReturnValue(mockClient);

	const client1 = createK8sClient();
	const client2 = createK8sClient();

	expect(mockedCreateK8sClient).toHaveBeenCalledTimes(2);
	expect(client1).toBe(client2);
	expect(client1).toBe(mockClient);
});
