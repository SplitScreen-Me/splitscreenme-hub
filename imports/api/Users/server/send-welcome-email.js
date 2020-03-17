import { Meteor } from 'meteor/meteor';
import sendEmail from '../../../modules/server/send-email';
import getOAuthProfile from '../../../modules/get-oauth-profile';

export default oauthUser => {
  const user = oauthUser || Meteor.user();
  const OAuthProfile = getOAuthProfile(user.profile, user);
  const { productName, githubProjectUrl } = Meteor.settings.public;
  const { supportEmail } = Meteor.settings.private;
  const firstName = OAuthProfile ? OAuthProfile.name.first : user.profile.username;
  const emailAddress = OAuthProfile ? OAuthProfile.email : user.emails[0].address;
  console.log('sending mail from ' + supportEmail);
  return sendEmail({
    to: emailAddress,
    from: supportEmail,
    subject: `[${productName}] Welcome, ${firstName}!`,
    template: 'welcome',
    templateVars: {
      title: `Welcome, ${firstName}!`,
      subtitle: `Here's how to get started with ${productName}.`,
      productName,
      firstName,
      githubProjectUrl,
      welcomeUrl: Meteor.absoluteUrl('faq'), // e.g., returns http://localhost:3000/documents
    },
  }).catch(error => {
    throw new Meteor.Error('500', `${error}`);
  });
};
