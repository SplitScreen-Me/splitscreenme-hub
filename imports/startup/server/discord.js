import { Meteor } from 'meteor/meteor';
import Handlers from '../../api/Handlers/Handlers';
const bound = Meteor.bindEnvironment((callback) => {callback();});
const Discord = eval('require')('discord.js');

const DiscordInit = () => {

const DiscordBot = new Discord.Client();
DiscordBot.on('ready', async () => {
  console.log('Connected as ' + DiscordBot.user.tag);
  console.log('Servers:');
  DiscordBot.guilds.forEach(guild => {
    console.log(' - ' + guild.name);
  });
  console.log(
    `Bot has started, with ${DiscordBot.users.size} users, in ${DiscordBot.channels.size} channels of ${DiscordBot.guilds.size} guilds.`,
  );
try {

  const totalHandlers = await Handlers.find({}).count();
  console.log("fetched");
  await DiscordBot.user.setActivity('Hosting ' + totalHandlers + ' handlers!');
  console.log("Count set");
  Meteor.setInterval(async () => {
    const totalHandlers = await Handlers.find({}).count();
    await DiscordBot.user.setActivity('Hosting ' + totalHandlers + ' handlers!');
  }, 10000);
}catch(e){
  console.log("error", e)
}
});
DiscordBot.on('guildCreate', guild => {
  // This event triggers when the bot joins a guild.
  console.log(
    `New guild joined: ${guild.name} (id: ${guild.id}). This guild has ${guild.memberCount} members!`,
  );
});

DiscordBot.on('guildDelete', guild => {
  // this event triggers when the bot is removed from a guild.
  console.log(`I have been removed from: ${guild.name} (id: ${guild.id})`);
});

DiscordBot.login(Meteor.settings.private.DISCORD_BOT_SECRET_TOKEN);

const DiscordBotCmd = {
  sendEverywhere: message => {
    let guildList = DiscordBot.guilds.array();
    guildList.forEach(guild => {
      try {
        let channelID;
        let channels = guild.channels;
        channelLoop: for (let c of channels) {
          let channelType = c[1].type;
          if (channelType === 'text') {
            channelID = c[0];
            break channelLoop;
          }
        }

        let channel = DiscordBot.channels.get(guild.systemChannelID || channelID);
        channel.send(message);
      } catch (err) {
        console.log('Could not send message to ' + guild.name);
      }
    });
  },
  setActivity: description => {
    DiscordBot.user.setActivity(description);
  },
};

DiscordBot.on('message', async receivedMessage => {
  if (receivedMessage.author == DiscordBot.user) {
    // Prevent bot from responding to its own messages
    return;
  }

  if (receivedMessage.content.startsWith('!')) {
    await processCommand(receivedMessage);
  }
});

async function processCommand(receivedMessage) {
  let fullCommand = receivedMessage.content.substr(1); // Remove the leading exclamation mark
  let splitCommand = fullCommand.split(' '); // Split the message up in to pieces for each space
  let primaryCommand = splitCommand[0]; // The first word directly after the exclamation is the command
  let argume = splitCommand.slice(1); // All other words are arguments/parameters/options for the command

  if (primaryCommand === 'handler') {
    await handlerCommand(argume, receivedMessage);
  } else {
    receivedMessage.channel.send("I don't understand the command. Try `!handler [game name]`");
  }
}

async function handlerCommand(argume, receivedMessage) {
  if (argume.length === 0) {
    receivedMessage.channel.send('Please, provide a game name.');
    return;
  }
  let totalGame = '';
  argume.forEach(value => {
    totalGame = totalGame + ' ' + value;
  });
  totalGame = totalGame.substr(1);
  const foundHandlers = await Handlers.find(
    {
      gameName: { $regex: new RegExp(totalGame), $options: 'i' },
      private: false,
      publicAuthorized: true,
    },
    {
      sort: { stars: -1 },
      limit: 3,
    },
  ).fetch();
  if (foundHandlers.length === 0) {
    receivedMessage.channel.send('Sorry, no handler found matching your query!');
  } else {
    foundHandlers.forEach(handler => {
      receivedMessage.channel.send({
        embed: {
          color: 3447003,
          author: {
            name: DiscordBot.user.username,
            icon_url: DiscordBot.user.avatarURL,
          },
          title: handler.gameName,
          url: `https://hub.splitscreen.me/handler/${handler._id}`,
          thumbnail: {
            url: `https://images.igdb.com/igdb/image/upload/t_cover_big/${handler.gameCover}.jpg`,
          },
          fields: [
            {
              name: 'Author',
              inline: true,
              value: handler.ownerName,
            },
            {
              name: 'Hotness',
              inline: true,
              value: handler.stars,
            },
            {
              name: 'Total downloads',
              inline: true,
              value: handler.downloadCount,
            },
          ],
          timestamp: new Date(),
          footer: {
            icon_url: DiscordBot.user.avatarURL,
            text: '© SplitScreen.Me',
          },
        },
      });
    });
  }
}
};
bound(() => {DiscordInit()});