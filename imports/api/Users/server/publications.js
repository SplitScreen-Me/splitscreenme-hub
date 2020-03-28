import { Meteor } from 'meteor/meteor';
import escapeRegExp from "../../../modules/regexescaper";

Meteor.publish('users.editProfile', function usersProfile() {
  return Meteor.users.find(this.userId, {
    fields: {
      emails: 1,
      profile: 1,
      services: 1,
    },
  });
});

Meteor.publish('users.getProfile', function getProfile(userId) {
  return Meteor.users.find(userId, {
    fields: {
      profile: 1,
    },
  });
});
Meteor.publish('users.searchProfile', function searchProfile(username) {
  return Meteor.users.find({'profile.username':  { $regex: new RegExp(escapeRegExp(username)), $options: 'i' }}, {
    fields: {
      profile: 1,
    },
    limit: 10,
  });
});
