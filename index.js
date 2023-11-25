const { Client, GatewayIntentBits } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const { Player, useQueue } = require('discord-player');
const play = require('./play');

const TOKEN = 'NzY3MTEzNDQxNzE4NDM1ODUw.G-v3ac.wIoY9UqD25_6ztWEGCT0pyrL7vYUyCxWqudHW0';
const CLIENT_ID = '767113441718435850';

const COURTROOM_A_ID = '824396697558843436';

const commands = [
  {
    name: 'play',
    description: 'Plays some music',
    options: [
      {
        name: 'query',
        description: 'Searches for a song',
        type: 3,
        required: true
      }
    ]
  },
  {
    name: 'pause',
    description: 'Pauses the queue',
  },
  {
    name: 'resume',
    description: 'Resumes the queue',
  },
  {
    name: 'skip',
    description: 'Skips the current track',
  },
];

const rest = new REST({ version: '10' }).setToken(TOKEN);
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
const player = new Player(client);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');
  
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
  
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }

  await player.extractors.loadDefault();
})();

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const queue = useQueue(interaction.guild.id);

  if (interaction.commandName === 'play') {
    await play(interaction);
  }

  if (interaction.commandName === 'pause') {
    queue.node.setPaused(true);

    await interaction.followUp('Track paused');
  }

  if (interaction.commandName === 'resume') {
    queue.node.setPaused(false);

    await interaction.followUp('Track resumed');
  }

  if (interaction.commandName === 'skip') {
    queue.node.skip();

    await interaction.followUp('Track skipped');
  }
});

client.login(TOKEN);