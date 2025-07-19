import type * as k8s from '@kubernetes/client-node';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
	ARGOCD_APP_NAME,
	ARGOCD_NAMESPACE,
	DEPLOYMENT_NAME,
	DEPLOYMENT_NAMESPACE,
} from '../k8sClient';

const mockMakeApiClient = vi.hoisted(() => vi.fn());
const mockLoadFromCluster = vi.hoisted(() => vi.fn());
const mockKubeConfig = vi.hoisted(() => vi.fn());

vi.mock('@kubernetes/client-node', () => ({
	KubeConfig: mockKubeConfig,
	AppsV1Api: vi.fn(),
	CustomObjectsApi: vi.fn(),
}));

beforeEach(() => {
	vi.clearAllMocks();
	mockKubeConfig.mockImplementation(() => ({
		loadFromCluster: mockLoadFromCluster,
		makeApiClient: mockMakeApiClient,
	}));
});

afterEach(() => {
	vi.doUnmock('../k8sClient');
	vi.resetModules();
});

it('should create and return k8s client', async () => {
	const mockClient = {} as k8s.AppsV1Api;

	mockMakeApiClient.mockReturnValue(mockClient);

	const { default: freshCreateK8sClient } = await import('../k8sClient');

	const client = freshCreateK8sClient();

	expect(mockKubeConfig).toHaveBeenCalledTimes(1);
	expect(mockLoadFromCluster).toHaveBeenCalledTimes(1);
	expect(mockMakeApiClient).toHaveBeenCalledWith(expect.anything());
	expect(client).toBe(mockClient);
});

it('should return same client on subsequent calls', async () => {
	const mockClient = {} as k8s.AppsV1Api;
	mockMakeApiClient.mockReturnValue(mockClient);

	const { default: freshCreateK8sClient } = await import('../k8sClient');

	const client1 = freshCreateK8sClient();
	const client2 = freshCreateK8sClient();

	expect(mockKubeConfig).toHaveBeenCalledTimes(1);
	expect(mockLoadFromCluster).toHaveBeenCalledTimes(1);
	expect(mockMakeApiClient).toHaveBeenCalledTimes(2);
	expect(client1).toBe(client2);
	expect(client1).toBe(mockClient);
});

it('should create argo cd client', async () => {
	const mockClient = {} as k8s.CustomObjectsApi;
	mockMakeApiClient.mockReturnValue(mockClient);

	const { createArgoCdClient } = await import('../k8sClient');

	const client = createArgoCdClient();

	expect(mockKubeConfig).toHaveBeenCalledTimes(1);
	expect(mockLoadFromCluster).toHaveBeenCalledTimes(1);
	expect(mockMakeApiClient).toHaveBeenCalledWith(expect.anything());
	expect(client).toBe(mockClient);
});

it('should export correct deployment constants', () => {
	expect(DEPLOYMENT_NAME).toBe('discord-bot');
	expect(DEPLOYMENT_NAMESPACE).toBe('discord-bot');
});

it('should export correct argo cd constants', () => {
	expect(ARGOCD_NAMESPACE).toBe('argo-cd');
	expect(ARGOCD_APP_NAME).toBe('discord-bot');
});
