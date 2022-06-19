import { Meteor } from 'meteor/meteor';
import { HTTP } from 'meteor/http';

const adminLogging_webhookUrl = Meteor.settings.private.DISCORD_ADMIN_LOGGING_WEBHOOK || 'https://discord.com/api/webhooks/985631056893980792/nlSCCJ1NwH7swqiKCe-1OnCBrMlb_nk1PzjqF97ER_zUrr6zn5MyX5nNZTUpZatwZJDh';
const releaseLogging_webhookUrl = Meteor.settings.private.DISCORD_RELEASE_LOGGING_WEBHOOK || 'https://discord.com/api/webhooks/985630979911741440/qaJpon-yIiC3avi17nogh7xTJP6bovulLcpg4kzM9snfXEmWLXng8ru_0qSAitKum382';
const releaseLogging_roleId = Meteor.settings.private.DISCORD_RELEASE_LOGGING_ROLEID || '985629240831639642';
const generalLogging_webhookUrl = Meteor.settings.private.DISCORD_GENERAL_LOGGING_WEBHOOK || 'https://discord.com/api/webhooks/985631024207757392/GpzkZiq7wuQh1M-YSCZQBQVmoYexffroaPEU3QIXVD5oHz-2KTGH8WnHkP_A7uh5DmWU';

// Discord Admin Logging :
const discord_admin_log = (title, description) => {
  if (adminLogging_webhookUrl.length > 0) {
    HTTP.call('POST', adminLogging_webhookUrl, {
      data: { content: `**${title}** - \`${description}\`` },
    });
  } else {
    console.log(`[Discord Admin Logging] ${title} - ${description}`);
  }
};
// Discord Release Logging :
const discord_release_log = (handler) => {
  const isNewRelease = handler.currentVersion === 1
  const discordMessage = isNewRelease ? '**New handler release!**' :  '**Handler updated!**'

  const discordData = {
    content: discordMessage,
    embeds: [
      {
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
            value: `[${handler.ownerName}](https://hub.splitscreen.me/user/${handler.owner})`,
          },
          {
            name: `Download`,
            inline: true,
            value: `[Download Handler (v${handler.currentVersion})](https://hub.splitscreen.me/cdn/storage/packages/${handler.currentPackage}/original/handler-${handler._id}-v${handler.currentVersion}.nc?download=true)`,
          },
        ],
        timestamp: new Date(),
        footer: {
          icon_url: 'https://www.splitscreen.me/img/splitscreen-me-logo.png',
          text: '© SplitScreen.Me',
        },
      },
    ],
  };

  if (releaseLogging_webhookUrl.length > 0 && generalLogging_webhookUrl) {
    HTTP.call('POST', releaseLogging_webhookUrl, {
      data: { ...discordData, content: `${discordData.content}\n<@&${releaseLogging_roleId}>` },
    });
    HTTP.call('POST', generalLogging_webhookUrl, {
      data: discordData,
    });
  } else {
    console.log(`[Discord Release Logging] ${handler.title} by ${handler.ownerName}`);
  }
};

export { discord_admin_log, discord_release_log };
