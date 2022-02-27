import {Client, Intents, MessageEmbed} from 'discord.js';
import levenshtein from 'fast-levenshtein';

import {countries, dates, criminals} from './utils.js';

const client = new Client({intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES]});

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on('messageCreate', async msg => {
  try {
    if (msg.content === '!wc') {
      msg.reply(`you have committed over ${Math.floor(Math.random() * (900 - 20) + 20)} war crimes in ${countries[Math.floor(Math.random() * countries.length)]}.`);
    } else if (msg.content === '!nys') {
        msg.reply(`jesteś Nysem w ${Math.floor(Math.random() * (120 - 2) + 2)}%`);
    } else if (msg.content === '!chungus') {
        msg.reply(`jesteś Chungusem w ${Math.floor(Math.random() * (120 - 2) + 2)}%`);
    } else if (levenshtein.get(msg.content, 'among us') <= 3) {
        msg.reply(`cringe/10`);
    } else if (msg.content === '!doin') {
        const random = msg.guild.members.cache.random().user.id;

        msg.reply(`I can confirm that <@!${random}> did your mum ${dates[Math.floor(Math.random() * dates.length)]}.`);
    } else if (msg.content === '!criminal') {
        const random = criminals[Math.floor(Math.random() * criminals.length)];

        const embed = new MessageEmbed();

        embed.color = '#0099ff';
        embed.title = `Jesteś ${random.name}!`;
        embed.url = random.url;
        embed.description = `Zostałeś skazany na ${random.sentence === Infinity ? 'dożywocie' : `${random.sentence} lat więzienia`} przez Międzynarodowy Trybunał Karny dla byłej Jugosławii w Hadze.`;
        embed.thumbnail = random.image ? {url: random.image} : undefined;
        embed.footer = {text: 'Dane: Wikipedia'};

        msg.channel.send({embeds: [embed]});
    }
  } catch (error) {
      const embed = new MessageEmbed();

      embed.color = '#ff0000';
      embed.title = `Silenced error`;
      embed.description = `Ping <@!349213466743013376>, dodatkowe informacje:\n\n\`${error.message ?? 'brak'}\``;
      embed.footer = {text: 'Bot kontynuuje normalną pracę.'};

      msg.channel.send({embeds: [embed]});
  }

});

client.login(process.env.BOT_TOKEN);
