import type { QueueFilters } from 'discord-player';
import type { GuildMember, ModalSubmitInteraction } from 'discord.js';
import type { CacheType } from 'discord.js';

export default async function usePlaylistModalSubmit(
	interaction: ModalSubmitInteraction<CacheType>,
) {
	await interaction.deferReply();

	const songs = interaction.fields.getTextInputValue('songsInput');
	const toPickRaw = interaction.fields.getTextInputValue('toPickInput');
	const isToPickEmpty = toPickRaw.length === 0;
	const channel = (interaction.member as GuildMember).voice.channel;

	if (!channel) {
		await interaction.editReply('You are not connected to a voice channel!');
		return;
	}

	const songsArray = songs.trim().split('\n');
	const toPick = isToPickEmpty
		? songsArray.length
		: Math.abs(Number.parseInt(toPickRaw, 10));
	let enqueued = 0;

	if (Number.isNaN(toPick) || toPick > songsArray.length || toPick === 0) {
		await interaction.editReply(
			'Invalid number of songs to pick was specified.',
		);
		return;
	}

	const { default: Queue } = await import('p-queue');

	const playlistQueue = new Queue();

	const prioritySongs = songsArray
		.filter((song) => song.startsWith('*'))
		.map((song) => song.replace('*', ''));
	let pickedSongs = [];

	if (isToPickEmpty) {
		pickedSongs = songsArray;
	} else if (prioritySongs.length === 0) {
		const { default: cryptoRandom } = await import('../utils/cryptoRandom');

		pickedSongs = songsArray.sort(() => 0.5 - cryptoRandom()).slice(0, toPick);
	} else {
		const { default: cryptoRandom } = await import('../utils/cryptoRandom');

		pickedSongs = [
			...songsArray
				.filter((song) => !song.startsWith('*'))
				.sort(() => 0.5 - cryptoRandom())
				.slice(0, Math.abs(toPick - prioritySongs.length)),
			...prioritySongs,
		].sort(() => 0.5 - cryptoRandom());
	}

	const { useMainPlayer } = await import('discord-player');

	const player = useMainPlayer();

	await playlistQueue.addAll(
		pickedSongs.map((song) => async () => {
			const promise = player.play(channel, song, {
				nodeOptions: {
					metadata: interaction,
					defaultFFmpegFilters: ['normalize' as keyof QueueFilters],
				},
				requestedBy: interaction.user.id,
			});

			try {
				enqueued++;
				return await promise;
			} catch {}
		}),
	);

	const { EmbedBuilder } = await import('discord.js');

	const embed = new EmbedBuilder()
		.setTitle('✅ Playlist loaded')
		.setDescription(
			`${enqueued} song(s) processed and added to queue.\n${
				pickedSongs.length - enqueued
			} skipped.\n\nNumber of priority songs: ${prioritySongs.length}.`,
		);

	await interaction.editReply({ embeds: [embed] });
}
