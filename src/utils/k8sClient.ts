import * as k8s from '@kubernetes/client-node';

const DEPLOYMENT_NAME = 'discord-bot';
const DEPLOYMENT_NAMESPACE = 'discord-bot';
const ARGO_CD_NAMESPACE = 'argo-cd';
const ARGO_CD_APP_NAME = 'discord-bot';

let kubeConfig: k8s.KubeConfig | null = null;

function getKubeConfig(): k8s.KubeConfig | null {
	if (!kubeConfig) {
		try {
			kubeConfig = new k8s.KubeConfig();
			/* v8 ignore start */
			kubeConfig.loadFromCluster();
			/* v8 ignore stop */
		} catch {
			return null;
		}
	}
	return kubeConfig;
}

export default function createK8sClient(): k8s.AppsV1Api | null {
	const kc = getKubeConfig();

	return kc ? kc.makeApiClient(k8s.AppsV1Api) : null;
}

export function createArgoCdClient(): k8s.CustomObjectsApi | null {
	const kc = getKubeConfig();

	return kc ? kc.makeApiClient(k8s.CustomObjectsApi) : null;
}

export {
	DEPLOYMENT_NAME,
	DEPLOYMENT_NAMESPACE,
	ARGO_CD_NAMESPACE as ARGOCD_NAMESPACE,
	ARGO_CD_APP_NAME as ARGOCD_APP_NAME,
};
