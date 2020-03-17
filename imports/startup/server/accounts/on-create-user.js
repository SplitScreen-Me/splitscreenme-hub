import { Accounts } from 'meteor/accounts-base';
import getOAuthProfile from '../../../modules/get-oauth-profile';
import sendWelcomeEmail from '../../../api/Users/server/send-welcome-email';
import UserSettings from '../../../api/UserSettings/UserSettings';
import Handlers from '../../../api/Handlers/Handlers';
import { Meteor } from 'meteor/meteor';

const isOAuthed = user => {
  return (
    user.services.facebook || user.services.github || user.services.google || user.services.discord
  );
};

Accounts.validateNewUser(user => {
  if (isOAuthed(user)) {
    return true;
  }
  if (
    user.profile &&
    user.profile.username &&
    user.profile.username.length >= 3 &&
    user.profile.username.length <= 16
  ) {
    return true;
  } else {
    throw new Meteor.Error(403, 'Username must be between 3 and 16 characters');
  }
});

Accounts.validateNewUser(user => {
  if (isOAuthed(user)) {
    return true;
  }
  const filter = /[^A-Za-z0-9]+/g;
  if (!filter.test(user.profile.username)) {
    return true;
  } else {
    throw new Meteor.Error(403, 'Username must use alphanumeric characters only.');
  }
});

Accounts.validateNewUser(user => {
  if (isOAuthed(user)) {
    return true;
  }
  const filter = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  if (filter.test(String(user.emails[0].address).toLowerCase())) {
    return true;
  } else {
    throw new Meteor.Error(403, 'Check your email address.');
  }
});

Accounts.validateNewUser(user => {
  if (isOAuthed(user)) {
    return true;
  }
  const findSameUsername = Meteor.users
    .find({
      'profile.username': { $regex: new RegExp(user.profile.username, 'i') },
    })
    .count();
  if (findSameUsername === 0) {
    return true;
  } else {
    throw new Meteor.Error(403, 'This username is already taken.');
  }
});
Accounts.config({
  sendVerificationEmail: true,
});
Accounts.onCreateUser((options, user) => {
  const userToCreate = user;
  const OAuthProfile = getOAuthProfile(options.profile, userToCreate);
  if (options.profile) {
    userToCreate.profile = options.profile;
  }

  // OAuth Specific (find a good username)
  if (OAuthProfile && OAuthProfile.username) {
    let finalUsername = OAuthProfile.username;
    while (
      Meteor.users
        .find({
          'profile.username': { $regex: new RegExp(finalUsername, 'i') },
        })
        .count() !== 0
    ) {
      finalUsername = OAuthProfile.username + Math.floor(1000 + Math.random() * 9000).toString();
    }
    userToCreate.profile.username = finalUsername;
  }

  if (OAuthProfile) {
    sendWelcomeEmail(userToCreate);
  } // Sent for OAuth accounts only here. Sent for password accounts after email verification (https://cleverbeagle.com/pup/v1/accounts/email-verification).

  userToCreate.roles = ['user']; // Set default roles for new sign ups.
  userToCreate.profile.starredHandlers = [];

  return userToCreate;
});
