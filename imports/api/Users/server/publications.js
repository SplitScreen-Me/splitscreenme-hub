import { Meteor } from 'meteor/meteor';

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
