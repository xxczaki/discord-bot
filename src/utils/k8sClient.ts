import * as k8s from '@kubernetes/client-node';

const DEPLOYMENT_NAME = 'discord-bot';
const DEPLOYMENT_NAMESPACE = 'discord-bot';

let k8sClient: k8s.AppsV1Api | null = null;

export default function createK8sClient() {
	if (!k8sClient) {
		const kc = new k8s.KubeConfig();

		kc.loadFromCluster();

		k8sClient = kc.makeApiClient(k8s.AppsV1Api);
	}

	return k8sClient;
}

export { DEPLOYMENT_NAME, DEPLOYMENT_NAMESPACE };
