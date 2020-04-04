import { Meteor } from 'meteor/meteor';
import { HTTP } from 'meteor/http';

const webhookUrl = Meteor.settings.private.DISCORD_ADMIN_LOGGING_WEBHOOK || "";

// Discord Admin Logging :
const d_aLog = (title, description) => {
  if(webhookUrl.length > 0){
  HTTP.call('POST', webhookUrl, {
    data: { content: `**${title}** - \`${description}\`` }
  })
  }else{
    console.log(`[Discord Admin Logging] ${title} - ${description}`);
  }
};

export {d_aLog};