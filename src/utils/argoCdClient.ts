import {
	ARGOCD_APP_NAME,
	ARGOCD_NAMESPACE,
	createArgoCdClient,
} from './k8sClient';
import logger from './logger';

const HELM_CHART_REPO_INDEX = 'https://xxczaki.github.io/charts/index.yaml';

interface ArgoCdApplication {
	status?: {
		sync?: {
			status?: string;
			revision?: string;
		};
		health?: {
			status?: string;
		};
	};
	spec?: {
		source?: {
			targetRevision?: string;
		};
	};
}

export async function getLatestChartVersion(): Promise<string | null> {
	try {
		const response = await fetch(HELM_CHART_REPO_INDEX);
		const indexYaml = await response.text();

		const lines = indexYaml.split('\n');
		const discordBotSection = lines.findIndex((line) =>
			line.includes('discord-bot:'),
		);

		if (discordBotSection === -1) return null;

		for (let i = discordBotSection + 1; i < lines.length; i++) {
			const line = lines[i].trim();

			if (line.startsWith('- version:')) {
				return line.split(':')[1].trim();
			}

			if (line && !line.startsWith(' ') && !line.startsWith('-')) {
				break;
			}
		}

		return null;
	} catch (error) {
		logger.error({ error }, 'Failed to fetch the latest chart version');
		return null;
	}
}

export async function updateArgoCdAppVersion(
	targetRevision: string,
): Promise<boolean> {
	const client = createArgoCdClient();

	if (!client) {
		logger.error('Argo CD client not available – running outside the cluster?');
		return false;
	}

	try {
		const patchOperation = {
			spec: {
				source: {
					targetRevision: targetRevision,
				},
			},
		};

		const response = await client.patchNamespacedCustomObject({
			group: 'argoproj.io',
			version: 'v1alpha1',
			namespace: ARGOCD_NAMESPACE,
			plural: 'applications',
			name: ARGOCD_APP_NAME,
			body: patchOperation,
		});

		logger.info(
			{ targetRevision, status: response.response?.statusCode },
			'Argo CD application target revision updated',
		);
		return true;
	} catch (error) {
		logger.error(
			{ error, targetRevision },
			'Failed to update the Argo CD app version',
		);
		return false;
	}
}

export async function triggerArgoCdSync(): Promise<boolean> {
	const client = createArgoCdClient();

	if (!client) {
		logger.error('Argo CD client not available – running outside the cluster?');
		return false;
	}

	try {
		const syncOperation = {
			operation: {
				sync: {
					syncStrategy: {
						force: false,
					},
					prune: true,
				},
			},
		};

		const response = await client.patchNamespacedCustomObject({
			group: 'argoproj.io',
			version: 'v1alpha1',
			namespace: ARGOCD_NAMESPACE,
			plural: 'applications',
			name: ARGOCD_APP_NAME,
			body: syncOperation,
		});

		logger.info(
			{ status: response.response?.statusCode },
			'Argo CD sync operation triggered',
		);
		return true;
	} catch (error) {
		logger.error({ error }, 'Failed to trigger Argo CD sync');
		return false;
	}
}

export async function getArgoCdAppStatus(): Promise<{
	syncStatus?: string;
	healthStatus?: string;
	revision?: string;
} | null> {
	const client = createArgoCdClient();

	if (!client) {
		return null;
	}

	try {
		const response = await client.getNamespacedCustomObject({
			group: 'argoproj.io',
			version: 'v1alpha1',
			namespace: ARGOCD_NAMESPACE,
			plural: 'applications',
			name: ARGOCD_APP_NAME,
		});

		const app = response.body as ArgoCdApplication;
		const status = app.status || {};

		return {
			syncStatus: status.sync?.status,
			healthStatus: status.health?.status,
			revision: status.sync?.revision,
		};
	} catch (error) {
		logger.error({ error }, 'Failed to get Argo CD app status');
		return null;
	}
}
