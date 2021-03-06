const Discord = require('discord.js');
const latestVersion = require('latest-version');
const {GraphQLClient} = require('graphql-request');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const config = require('./config.json');

const adapter = new FileSync('db.json');
const db = low(adapter);

const client = new Discord.Client();

// Get changelog of the Electron project
const getChangelog = async version => {
	const graphQLClient = new GraphQLClient('https://api.github.com/graphql', {
		headers: {
			Authorization: `bearer ${config.githubToken}`
		}
	});

	const query = `
	  {
		  repository(owner: "electron", name: "electron") {
			release(tagName: "v${version}") {
			  description
			}
		  }
	  }	
	  `;

	const data = await graphQLClient.request(query);

	return data.repository.release.description;
};

// Convert to ms
function round(n, k) {
	const factor = 10 ** k;
	return Math.round(n * factor) / factor;
}

// Ready state
client.on('ready', () => {
	console.log(`Zalogowano jako ${client.user.tag}!`);
	client.user.setActivity('!pomoc');

	// Every 2 days check for the new Electron version and notify if it's available
	setInterval(async () => {
		const channel = await client.channels.get('526127851813076992');

		if (!channel) {
			return;
		}

		const version = await latestVersion('electron');

		if (db.get('version').value() === version.toString()) {
			console.log('No new Electron version was released.');
		} else {
			const changelog = await getChangelog(version);

			const embed = {
				title: `NEW Electron version released: ${version}`,
				color: 0x01579B,
				description: `
					${'```markdown\n' + changelog + '\n' + '```'}
					`,
				footer: {
					icon_url: 'https://imgur.com/I04By3T.png',
					text: 'Electron Polska Bot by xxczaki'
				}
			};

			await channel.send({embed});

			db.set('version', version).write();
		}
	}, 172800);
});

// Send a welcome message, if a new member joins the server
client.on('guildMemberAdd', async member => {
	const channel = await member.guild.channels.find(ch => ch.name === 'powitania');
	if (!channel) {
		return;
	}

	channel.send(`Witaj na serwerze, ${member}!`);
});

// Commands
client.on('message', async message => {
	if (message.author.bot) {
		return;
	}

	if (message.content.indexOf(config.prefix) !== 0) {
		return;
	}

	const args = message.content.slice(config.prefix.length).trim().split(/ +/g);
	const command = args.shift().toLowerCase();

	// Show help message
	if (command === 'pomoc') {
		try {
			const embed = {
				title: 'Dostępne komendy:',
				color: 0x01579B,
				description: `
!pomoc - wyświetla wiadomość pomocniczą
!linki - wyświetla listę przydatnych linków
!changelog - wyświetla opis zmian dokonanych w najnowszej wersji Electrona
!ping - podaje czas odpowiedzi serwera
         `,
				footer: {
					icon_url: 'https://imgur.com/I04By3T.png',
					text: 'Electron Polska Bot by xxczaki'
				}
			};

			await message.channel.send({embed});
		} catch (error) {
			console.log(error);
		}
	}

	// Show useful links related to the Electron Framework
	if (command === 'linki') {
		try {
			const embed = {
				title: 'Przydatne linki:',
				color: 0x01579B,
				description: `
- ${'[Strona społeczności Electron Polska](https://electronpl.github.io)'}
- ${'[Główna strona projektu Electron](https://electronjs.org/)'}
- ${'[Dokumentacja projektu Electron](https://electronjs.org/docs)'}
- ${'[Ciekawe zasoby związane z projektem Electron](https://github.com/sindresorhus/awesome-electron)'}
- ${'[Strona do tłumaczenia dokumentacji projektu na Język polski](https://crowdin.com/project/electron/pl#)'}
         `,
				footer: {
					icon_url: 'https://imgur.com/I04By3T.png',
					text: 'Electron Polska Bot by xxczaki'
				}
			};

			await message.channel.send({embed});
		} catch (error) {
			console.log(error);
		}
	}

	// Check user's ping
	if (command === 'ping') {
		try {
			const {ping} = client;
			const embed = {
				title: 'Pong!',
				color: 0x01579B,
				description: `Czas odpowiedzi serwera wyniósł ${'`' + round(ping, 0) + 'ms' + '`'}`,
				footer: {
					icon_url: 'https://imgur.com/I04By3T.png',
					text: 'Electron Polska Bot by xxczaki'
				}
			};

			await message.channel.send({embed});
		} catch (error) {
			console.log(error);
		}
	}

	// Get changelog from the latest Electron version
	if (command === 'changelog') {
		try {
			const version = await latestVersion('electron');
			const changelog = await getChangelog(version);

			const embed = {
				title: `Electron ${version}`,
				color: 0x01579B,
				description: `
					${'```markdown\n' + changelog + '\n' + '```'}
					`,
				footer: {
					icon_url: 'https://imgur.com/I04By3T.png',
					text: 'Electron Polska Bot by xxczaki'
				}
			};

			await message.channel.send({embed});
		} catch (error) {
			console.log(error);
		}
	}
});

// Login using Discord Bot's token
client.login(config.botToken);
