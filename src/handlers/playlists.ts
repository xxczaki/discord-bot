import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	type ChatInputCommandInteraction,
	type GuildMember,
	type InteractionResponse,
	StringSelectMenuBuilder,
	type TextBasedChannel,
	type VoiceBasedChannel,
} from 'discord.js';
import { DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS } from '../constants/miscellaneous';
import enqueuePlaylists from '../utils/enqueuePlaylists';
import getEnvironmentVariable from '../utils/getEnvironmentVariable';
import getPlaylists from '../utils/getPlaylists';
import pluralize from '../utils/pluralize';

const pluralizePlaylists = pluralize('playlist', 'playlists');

export default async function playlistsCommandHandler(
	interaction: ChatInputCommandInteraction,
) {
	const channel = interaction.client.channels.cache.get(
		getEnvironmentVariable('PLAYLISTS_CHANNEL_ID'),
	);

	if (!channel?.isTextBased()) {
		return interaction.reply({
			content: 'Invalid playlists channel type!',
			flags: ['Ephemeral'],
		});
	}

	const voiceChannel = (interaction.member as GuildMember).voice.channel;

	if (!voiceChannel) {
		return interaction.reply({
			content: 'You are not connected to a voice channel!',
			components: [],
			flags: ['Ephemeral'],
		});
	}

	const initialPlaylistData = await getPlaylists(channel, 0);

	if (initialPlaylistData.totalItems === 0) {
		return interaction.reply({
			content: 'No playlists found!',
			flags: ['Ephemeral'],
		});
	}

	const response = await interaction.reply({
		content: 'Loading playlists…',
		flags: ['Ephemeral'],
	});

	await showPlaylistPage(response, channel, voiceChannel, 0);
}

async function showPlaylistPage(
	response: InteractionResponse<boolean>,
	channel: TextBasedChannel,
	voiceChannel: VoiceBasedChannel,
	page: number,
) {
	const playlistData = await getPlaylists(channel, page);

	const select = new StringSelectMenuBuilder()
		.setCustomId('playlistSelect')
		.setPlaceholder('Select up to 5 entries')
		.addOptions(...playlistData.options)
		.setMinValues(1)
		.setMaxValues(Math.min(5, playlistData.options.length));

	const previous = new ButtonBuilder()
		.setCustomId(`previous_${page - 1}`)
		.setLabel('Previous')
		.setStyle(ButtonStyle.Secondary)
		.setDisabled(page === 0);

	const next = new ButtonBuilder()
		.setCustomId(`next_${page + 1}`)
		.setLabel('Next')
		.setStyle(ButtonStyle.Secondary)
		.setDisabled(page + 1 >= playlistData.totalPages);

	const cancel = new ButtonBuilder()
		.setCustomId('cancel')
		.setLabel('Cancel')
		.setStyle(ButtonStyle.Secondary);

	const selects = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
		select,
	);
	const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
		previous,
		next,
		cancel,
	);

	const pageInfo =
		playlistData.totalItems < 25
			? `Found ${pluralizePlaylists`${playlistData.totalItems} ${null}`}`
			: playlistData.totalPages > 1
				? `Found ${pluralizePlaylists`${playlistData.totalItems} ${null}`}, showing ${page * 25 + 1}-${page * 25 + playlistData.options.length}`
				: `Found ${pluralizePlaylists`${playlistData.totalItems} ${null}`}`;

	const components =
		playlistData.totalPages > 1
			? [selects, buttons]
			: [selects, new ActionRowBuilder<ButtonBuilder>().addComponents(cancel)];

	await response.edit({
		content: pageInfo,
		components,
	});

	await componentResponseListener(response, channel, voiceChannel);
}

async function componentResponseListener(
	response: InteractionResponse<boolean>,
	channel: TextBasedChannel,
	voiceChannel: VoiceBasedChannel,
) {
	try {
		const answer = await response.awaitMessageComponent({
			time: DEFAULT_MESSAGE_COMPONENT_AWAIT_TIME_MS,
		});

		if (answer.isButton()) {
			if (answer.customId === 'cancel') {
				return response.delete();
			}

			if (
				answer.customId.startsWith('previous_') ||
				answer.customId.startsWith('next_')
			) {
				const newPage = Number.parseInt(answer.customId.split('_')[1], 10);
				const newResponse = await answer.update({
					content: 'Loading playlists…',
					components: [],
				});

				return showPlaylistPage(newResponse, channel, voiceChannel, newPage);
			}
		}

		if (answer.isStringSelectMenu()) {
			await response.delete();
			return enqueuePlaylists(answer, voiceChannel);
		}
	} catch {
		try {
			await response.delete();
		} catch {
			// Response might already be deleted
		}
	}
}
