import { Meteor } from 'meteor/meteor';
import sendEmail from '../../../modules/server/send-email';
import getOAuthProfile from '../../../modules/get-oauth-profile';

export default (repliedToUserId, handlerGameName, ellipsedComment, handlerUrl) => {

  const fromUser = Meteor.user();
  const fromFirstName = fromUser.profile.username;

  const toUser = Meteor.users.find({ _id: repliedToUserId }).fetch()[0];
  const toOAuthProfile = getOAuthProfile(toUser.profile, toUser);
  const toFirstName = toOAuthProfile ? toOAuthProfile.name.first : toUser.profile.username;
  const toEmailAddress = toOAuthProfile ? toOAuthProfile.email : toUser.emails[0].address;

  const { productName, githubProjectUrl } = Meteor.settings.public;
  const { supportEmail } = Meteor.settings.private;
  console.log('sending comment reply mail from ' + supportEmail);
  return sendEmail({
    to: toEmailAddress,
    from: supportEmail,
    subject: `[${productName}] Reply on your thread, ${toFirstName}!`,
    template: 'comment-reply',
    templateVars: {
      title: `Reply on your thread, ${toFirstName}!`,
      subtitle: `Someone answered to you on ${productName}.`,
      productName,
      fromFirstName,
      githubProjectUrl,
      toFirstName,
      handlerGameName,
      ellipsedComment,
      handlerUrl,
      welcomeUrl: Meteor.absoluteUrl('faq'),
    },
  }).catch(error => {
    throw new Meteor.Error('500', `${error}`);
  });
};
