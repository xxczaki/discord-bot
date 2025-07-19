import * as k8s from '@kubernetes/client-node';

const DEPLOYMENT_NAME = 'discord-bot';
const DEPLOYMENT_NAMESPACE = 'discord-bot';

let k8sClient: k8s.AppsV1Api | null = null;

export default function createK8sClient(): k8s.AppsV1Api | null {
	if (!k8sClient) {
		try {
			const kc = new k8s.KubeConfig();

			/* v8 ignore start */
			kc.loadFromCluster();

			k8sClient = kc.makeApiClient(k8s.AppsV1Api);
			/* v8 ignore stop */
		} catch {
			return null;
		}
	}

	return k8sClient;
}

export { DEPLOYMENT_NAME, DEPLOYMENT_NAMESPACE };
