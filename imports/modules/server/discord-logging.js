import { Meteor } from 'meteor/meteor';
import { HTTP } from 'meteor/http';

const adminLogging_webhookUrl = Meteor.settings.private.DISCORD_ADMIN_LOGGING_WEBHOOK || "";
const releaseLogging_webhookUrl = Meteor.settings.private.DISCORD_RELEASE_LOGGING_WEBHOOK || "";

// Discord Admin Logging :
const d_aLog = (title, description) => {
  if(adminLogging_webhookUrl.length > 0){
    HTTP.call('POST', adminLogging_webhookUrl, {
      data: { content: `**${title}** - \`${description}\`` }
    })
  }else{
    console.log(`[Discord Admin Logging] ${title} - ${description}`);
  }
};
// Discord Release Logging :
const d_rLog = handler => {
  if(releaseLogging_webhookUrl.length > 0){
    HTTP.call('POST', releaseLogging_webhookUrl, {
      data: {
        content: "**New handler release!**",
        embeds: [{
          color: 3447003,
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
          ],
          timestamp: new Date(),
          footer: {
            icon_url: "https://www.splitscreen.me/img/splitscreen-me-logo.png",
            text: '© SplitScreen.Me',
          },
        }],
      }
    })
  }else{
    console.log(`[Discord Release Logging] ${handler.title} by ${handler.ownerName}`);
  }
};

export {d_aLog, d_rLog};