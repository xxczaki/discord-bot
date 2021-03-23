import Discord from 'discord.js';
import levenshtein from 'fast-levenshtein';
import si from 'systeminformation';

import {countries, dates, criminals} from './utils.js';

const client = new Discord.Client();

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on('message', async msg => {
  if (msg.content === '!wc') {
    msg.reply(`you have committed over ${Math.floor(Math.random() * (900 - 20) + 20)} war crimes in ${countries[Math.floor(Math.random() * countries.length)]}.`);
  } else if (msg.content === '!nys') {
      msg.reply(`jesteś Nysem w ${Math.floor(Math.random() * (120 - 2) + 2)}%`);
  } else if (msg.content === '!chungus') {
      msg.reply(`jesteś Chungusem w ${Math.floor(Math.random() * (120 - 2) + 2)}%`);
  } else if (levenshtein.get(msg.content, 'among us') <= 3) {
      msg.reply(`cringe/10`);
  } else if (levenshtein.get(msg.content, '!doin') <= 3) {
      const random = await msg.guild.members.cache.random().id;

      msg.reply(`I can confirm that <@!${random}> did your mum ${dates[Math.floor(Math.random() * dates.length)]}.`);
  } else if (msg.content === '!criminal') {
      const random = criminals[Math.floor(Math.random() * criminals.length)];

      const embed = new Discord.MessageEmbed()
          .setColor('#0099ff')
          .setTitle(`Jesteś ${random.name}!`)
          .setURL(random.url)
          .setDescription(`Zostałeś skazany na ${random.sentence === Infinity ? 'dożywocie' : `${random.sentence} lat więzienia`} przez Międzynarodowy Trybunał Karny dla byłej Jugosławii w Hadze.`)
          .setThumbnail(random.image || undefined)
          .setFooter('Dane: Wikipedia');

      msg.channel.send(embed);
  } else if (levenshtein.get(msg.content, '!temp') <= 3) {
      msg.channel.send(await si.cpuTemperature());
  }
});

client.login('NzY3MTEzNDQxNzE4NDM1ODUw.X4tMEA.3x43qkbbpjRZtu7pSE73QjUOu2w');
