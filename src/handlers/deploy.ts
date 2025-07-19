import type {
	ChatInputCommandInteraction,
	MessageComponentInteraction,
} from 'discord.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS } from '../constants/miscellaneous';
import {
	getArgoCdAppStatus,
	getLatestChartVersion,
	triggerArgoCdSync,
	updateArgoCdAppVersion,
} from '../utils/argoCdClient';
import logger from '../utils/logger';
import reportError from '../utils/reportError';

export default async function deployCommandHandler(
	interaction: ChatInputCommandInteraction,
) {
	try {
		const [currentStatus, latestChartVersion] = await Promise.all([
			getArgoCdAppStatus(),
			getLatestChartVersion(),
		]);

		if (!currentStatus) {
			await interaction.reply(
				'❌ Deployment sync is not available – running outside of cluster environment.',
			);
			return;
		}

		if (!latestChartVersion) {
			await interaction.reply(
				'❌ Failed to fetch the latest chart version. Please try again later.',
			);
			return;
		}

		const statusEmbed = {
			title: 'Deployment status',
			fields: [
				{
					name: 'Current chart version',
					value: currentStatus.revision?.substring(0, 8) || 'Unknown',
					inline: true,
				},
				{
					name: 'Latest chart version',
					value: latestChartVersion.substring(0, 8),
					inline: true,
				},
				{
					name: 'Sync status',
					value: currentStatus.syncStatus || 'Unknown',
					inline: true,
				},
				{
					name: 'Health status',
					value: currentStatus.healthStatus || 'Unknown',
					inline: true,
				},
			],
			color: currentStatus.syncStatus === 'Synced' ? 0x00ff00 : 0xffaa00,
		};

		const confirmButton = new ButtonBuilder()
			.setCustomId('deploy-confirm')
			.setLabel('Deploy Now')
			.setStyle(ButtonStyle.Danger);

		const cancelButton = new ButtonBuilder()
			.setCustomId('deploy-cancel')
			.setLabel('Cancel')
			.setStyle(ButtonStyle.Secondary);

		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			confirmButton,
			cancelButton,
		);

		const response = await interaction.reply({
			content: `🚀 **Deployment confirmation required**\nThis will update to chart version \`${latestChartVersion}\` and trigger an immediate Argo CD sync.`,
			embeds: [statusEmbed],
			components: [row],
		});

		try {
			const buttonInteraction = await response.awaitMessageComponent({
				filter: (i) => i.user.id === interaction.user.id,
				time: DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS, // 30 seconds timeout
			});

			if (buttonInteraction.customId === 'deploy-cancel') {
				await buttonInteraction.update({
					content: '❌ Deployment cancelled.',
					embeds: [statusEmbed],
					components: [],
				});
				return;
			}

			await buttonInteraction.update({
				content:
					'🚀 **Deploying...** Updating chart version and triggering Argo CD sync...',
				embeds: [statusEmbed],
				components: [],
			});

			const [updateSuccess, syncSuccess] = await Promise.all([
				updateArgoCdAppVersion(latestChartVersion),
				new Promise<boolean>((resolve) => {
					setTimeout(async () => {
						const result = await triggerArgoCdSync();
						resolve(result);
					}, 1000);
				}),
			]);

			const isSuccess = updateSuccess && syncSuccess;

			if (isSuccess) {
				await buttonInteraction.editReply({
					content: `✅ **Deployment triggered successfully!**\nUpdated to chart version \`${latestChartVersion}\` and monitoring progress...`,
					embeds: [statusEmbed],
				});

				await monitorDeploymentStatus(
					buttonInteraction,
					statusEmbed,
					latestChartVersion,
				);

				logger.info(
					{ userId: interaction.user.id, chartVersion: latestChartVersion },
					'Deploy command executed successfully',
				);
			} else {
				await buttonInteraction.editReply({
					content:
						'❌ **Deployment failed.** Please check the logs or try again later.',
					embeds: [statusEmbed],
				});
			}
		} catch {
			await interaction.editReply({
				content: '⏰ Deployment confirmation timed out.',
				embeds: [statusEmbed],
				components: [],
			});
		}
	} catch (error) {
		reportError(error, 'Failed to execute the `/deploy` command');

		if (!interaction.replied && !interaction.deferred) {
			await interaction.reply(
				'❌ Failed to execute deployment sync. Please check the logs or try again later.',
			);
		}
	}
}

async function monitorDeploymentStatus(
	interaction: MessageComponentInteraction,
	initialEmbed: {
		title: string;
		fields: Array<{ name: string; value: string; inline: boolean }>;
		color: number;
	},
	targetVersion: string,
): Promise<void> {
	const maxChecks = 12; // 60 seconds total
	const checkInterval = 5000; // 5 seconds

	for (let i = 0; i < maxChecks; i++) {
		await new Promise((resolve) => setTimeout(resolve, checkInterval));

		try {
			const status = await getArgoCdAppStatus();
			if (!status) break;

			const updatedEmbed = {
				...initialEmbed,
				fields: [
					{
						name: 'Target version',
						value: targetVersion.substring(0, 8),
						inline: true,
					},
					{
						name: 'Current revision',
						value: status.revision?.substring(0, 8) || 'Unknown',
						inline: true,
					},
					{
						name: 'Sync status',
						value: status.syncStatus || 'Unknown',
						inline: true,
					},
					{
						name: 'Health status',
						value: status.healthStatus || 'Unknown',
						inline: true,
					},
				],
				color: status.syncStatus === 'Synced' ? 0x00ff00 : 0xffaa00,
				footer: {
					text: `Last updated: ${new Date().toLocaleTimeString()}`,
				},
			};

			await interaction.editReply({
				content:
					status.syncStatus === 'Synced'
						? '✅ **Deployment completed successfully!**'
						: `🔄 **Deployment in progress...** (${i * 5 + 5}s)`,
				embeds: [updatedEmbed],
			});

			if (status.syncStatus === 'Synced') {
				break;
			}
		} catch (error) {
			logger.error({ error }, 'Failed to monitor deployment status');
			break;
		}
	}
}
