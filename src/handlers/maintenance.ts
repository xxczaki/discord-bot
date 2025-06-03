import * as k8s from '@kubernetes/client-node';
import { captureException } from '@sentry/node';
import type { ChatInputCommandInteraction } from 'discord.js';
import getEnvironmentVariable from '../utils/getEnvironmentVariable';
import logger from '../utils/logger';

const DEPLOYMENT_NAME = 'discord-bot';
const DEPLOYMENT_NAMESPACE = 'discord-bot';

const ownerUserId = getEnvironmentVariable('OWNER_USER_ID');

export default async function maintenanceCommandHandler(
	interaction: ChatInputCommandInteraction,
) {
	const userId = interaction.member?.user.id;

	if (userId !== ownerUserId) {
		return interaction.reply({
			content: `Only <@!${ownerUserId}> is allowed to run this command.`,
			flags: ['Ephemeral'],
		});
	}

	await interaction.reply('🔧 Activating maintenance mode...');

	try {
		const kc = new k8s.KubeConfig();

		kc.loadFromCluster();

		const k8sAppsV1Api = kc.makeApiClient(k8s.AppsV1Api);

		const deployment = await k8sAppsV1Api.readNamespacedDeployment({
			name: DEPLOYMENT_NAME,
			namespace: DEPLOYMENT_NAMESPACE,
		});

		if (!deployment.spec) {
			logger.error({}, 'Deployment spec is missing');

			return interaction.editReply(
				'❌ Failed to activate maintenance mode: Deployment spec is missing',
			);
		}

		const scaledDeployment: k8s.V1Deployment = {
			...deployment,
			spec: {
				...deployment.spec,
				replicas: 0,
			},
		};

		await k8sAppsV1Api.replaceNamespacedDeployment({
			name: DEPLOYMENT_NAME,
			namespace: DEPLOYMENT_NAMESPACE,
			body: scaledDeployment,
		});

		await interaction.editReply(
			'✅ Maintenance mode activated! Bot scaled down to 0 replicas.',
		);

		logger.info({}, 'Bot scaled down for maintenance');
	} catch (error) {
		logger.error(error, 'Failed to scale down deployment for maintenance');
		captureException(error);

		const errorMessage =
			error instanceof Error ? error.message : 'Unknown error occurred';

		await interaction.editReply(
			`❌ Failed to activate maintenance mode: ${errorMessage}

Please check the logs or try again later.`,
		);
	}
}
