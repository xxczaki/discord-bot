import createK8sClient, {
	DEPLOYMENT_NAME,
	DEPLOYMENT_NAMESPACE,
} from './k8sClient';
import logger from './logger';

export default async function getDeploymentVersion() {
	try {
		const k8sAppsV1Api = createK8sClient();

		if (!k8sAppsV1Api) {
			return;
		}

		const deployment = await k8sAppsV1Api.readNamespacedDeployment({
			name: DEPLOYMENT_NAME,
			namespace: DEPLOYMENT_NAMESPACE,
		});

		const labels = deployment.metadata?.labels;
		const helmChart = labels?.['helm.sh/chart'];

		if (!helmChart) {
			return;
		}

		// Extract version from "discord-bot-0.14.0" format
		const version = helmChart.split('-').pop();

		return version;
	} catch (error) {
		if (error instanceof TypeError && error.message === 'Invalid URL') {
			return logger.warn(
				'Kubernetes API not available – running outside of cluster environment',
			);
		}

		logger.warn(error, 'Failed to get deployment version');
	}
}
