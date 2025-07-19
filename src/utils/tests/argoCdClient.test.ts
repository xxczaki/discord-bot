import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
	getArgoCdAppStatus,
	getLatestChartVersion,
	triggerArgoCdSync,
	updateArgoCdAppVersion,
} from '../argoCdClient';

const mockCreateArgoCdClient = vi.hoisted(() => vi.fn());
const mockFetch = vi.hoisted(() => vi.fn());

vi.mock('../k8sClient', () => ({
	createArgoCdClient: mockCreateArgoCdClient,
	ARGOCD_NAMESPACE: 'argo-cd',
	ARGOCD_APP_NAME: 'discord-bot',
}));

vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
	vi.clearAllMocks();
});

afterEach(() => {
	vi.resetModules();
});

it('should fetch latest chart version successfully', async () => {
	const mockIndexYaml = `
entries:
  discord-bot:
    - version: 1.2.3
      appVersion: v1.2.3
    - version: 1.2.2
      appVersion: v1.2.2
`;

	mockFetch.mockResolvedValue({
		text: () => Promise.resolve(mockIndexYaml),
	});

	const version = await getLatestChartVersion();

	expect(mockFetch).toHaveBeenCalledWith(
		'https://xxczaki.github.io/charts/index.yaml',
	);
	expect(version).toBe('1.2.3');
});

it('should return null when chart not found in index', async () => {
	const mockIndexYaml = `
entries:
  other-chart:
    - version: 1.0.0
`;

	mockFetch.mockResolvedValue({
		text: () => Promise.resolve(mockIndexYaml),
	});

	const version = await getLatestChartVersion();

	expect(version).toBeNull();
});

it('should return null when fetch fails', async () => {
	mockFetch.mockRejectedValue(new Error('Network error'));

	const version = await getLatestChartVersion();

	expect(version).toBeNull();
});

it('should update argo cd app version successfully', async () => {
	const mockClient = {
		patchNamespacedCustomObject: vi.fn().mockResolvedValue({
			response: { statusCode: 200 },
		}),
	};

	mockCreateArgoCdClient.mockReturnValue(mockClient);

	const success = await updateArgoCdAppVersion('1.2.3');

	expect(mockClient.patchNamespacedCustomObject).toHaveBeenCalledWith({
		group: 'argoproj.io',
		version: 'v1alpha1',
		namespace: 'argo-cd',
		plural: 'applications',
		name: 'discord-bot',
		body: {
			spec: {
				source: {
					targetRevision: '1.2.3',
				},
			},
		},
	});
	expect(success).toBe(true);
});

it('should return false when argo cd client not available for update', async () => {
	mockCreateArgoCdClient.mockReturnValue(null);

	const success = await updateArgoCdAppVersion('1.2.3');

	expect(success).toBe(false);
});

it('should return false when update patch fails', async () => {
	const mockClient = {
		patchNamespacedCustomObject: vi
			.fn()
			.mockRejectedValue(new Error('Patch failed')),
	};

	mockCreateArgoCdClient.mockReturnValue(mockClient);

	const success = await updateArgoCdAppVersion('1.2.3');

	expect(success).toBe(false);
});

it('should trigger argo cd sync successfully', async () => {
	const mockClient = {
		patchNamespacedCustomObject: vi.fn().mockResolvedValue({
			response: { statusCode: 200 },
		}),
	};

	mockCreateArgoCdClient.mockReturnValue(mockClient);

	const success = await triggerArgoCdSync();

	expect(mockClient.patchNamespacedCustomObject).toHaveBeenCalledWith({
		group: 'argoproj.io',
		version: 'v1alpha1',
		namespace: 'argo-cd',
		plural: 'applications',
		name: 'discord-bot',
		body: {
			operation: {
				sync: {
					syncStrategy: {
						force: false,
					},
					prune: true,
				},
			},
		},
	});
	expect(success).toBe(true);
});

it('should return false when argo cd client not available for sync', async () => {
	mockCreateArgoCdClient.mockReturnValue(null);

	const success = await triggerArgoCdSync();

	expect(success).toBe(false);
});

it('should return false when sync patch fails', async () => {
	const mockClient = {
		patchNamespacedCustomObject: vi
			.fn()
			.mockRejectedValue(new Error('Sync failed')),
	};

	mockCreateArgoCdClient.mockReturnValue(mockClient);

	const success = await triggerArgoCdSync();

	expect(success).toBe(false);
});

it('should get argo cd app status successfully', async () => {
	const mockClient = {
		getNamespacedCustomObject: vi.fn().mockResolvedValue({
			body: {
				status: {
					sync: {
						status: 'Synced',
						revision: 'abc123def456',
					},
					health: {
						status: 'Healthy',
					},
				},
			},
		}),
	};

	mockCreateArgoCdClient.mockReturnValue(mockClient);

	const status = await getArgoCdAppStatus();

	expect(mockClient.getNamespacedCustomObject).toHaveBeenCalledWith({
		group: 'argoproj.io',
		version: 'v1alpha1',
		namespace: 'argo-cd',
		plural: 'applications',
		name: 'discord-bot',
	});
	expect(status).toEqual({
		syncStatus: 'Synced',
		healthStatus: 'Healthy',
		revision: 'abc123def456',
	});
});

it('should return null when argo cd client not available for status', async () => {
	mockCreateArgoCdClient.mockReturnValue(null);

	const status = await getArgoCdAppStatus();

	expect(status).toBeNull();
});

it('should return null when status fetch fails', async () => {
	const mockClient = {
		getNamespacedCustomObject: vi
			.fn()
			.mockRejectedValue(new Error('Status failed')),
	};

	mockCreateArgoCdClient.mockReturnValue(mockClient);

	const status = await getArgoCdAppStatus();

	expect(status).toBeNull();
});

it('should handle missing status fields gracefully', async () => {
	const mockClient = {
		getNamespacedCustomObject: vi.fn().mockResolvedValue({
			body: {},
		}),
	};

	mockCreateArgoCdClient.mockReturnValue(mockClient);

	const status = await getArgoCdAppStatus();

	expect(status).toEqual({
		syncStatus: undefined,
		healthStatus: undefined,
		revision: undefined,
	});
});
