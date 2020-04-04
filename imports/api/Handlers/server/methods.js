/* eslint-disable consistent-return */

import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';
import Handlers from '../Handlers';
import Comments from '../../Comments/Comments';
import Packages from '../../Packages/server/ServerPackages';
import handleMethodException from '../../../modules/handle-method-exception';
import rateLimit from '../../../modules/rate-limit';

Meteor.methods({
  'handlers.findOne': function handlersFindOne(handlerId) {
    check(handlerId, Match.OneOf(String, undefined));
    try {
      return Handlers.findOne(handlerId);
    } catch (exception) {
      handleMethodException(exception);
    }
  },
  'handlers.starring': function handlerStarring(handlerId) {
    check(handlerId, Match.OneOf(String, undefined));
    try {
      const handler = Handlers.findOne(handlerId);
      const user = Meteor.users.findOne({ _id: this.userId });
      if (user.profile.starredHandlers.includes(handlerId)) {
        Meteor.users.update(this.userId, {
          $set: {
            'profile.starredHandlers': user.profile.starredHandlers.filter(
              item => item !== handlerId,
            ),
          },
        });
        Handlers.update(handlerId, { $set: { stars: handler.stars - 1 } });
      } else {
        Meteor.users.update(this.userId, {
          $set: {
            'profile.starredHandlers': [...user.profile.starredHandlers, handlerId],
          },
        });
        Handlers.update(handlerId, { $set: { stars: handler.stars + 1 } });
      }
      return Handlers.findOne(handlerId);
    } catch (exception) {
      handleMethodException(exception);
    }
  },
  'handlers.insert': function handlersInsert(doc) {
    check(doc, {
      title: String,
      gameName: String,
      gameDescription: String,
      gameCover: String,
      gameId: Number,
      gameUrl: String,
    });
    if (doc.title.length > 4 && doc.title.length < 61) {
      try {
        const user = Meteor.users.findOne({ _id: this.userId });
        if ((user.emails && user.emails[0] && user.emails[0].verified) || !user.services.password) {
          return Handlers.insert({
            owner: this.userId,
            ownerName: user.profile.username,
            description: '## Fill a description\n\nMarkdown is **supported** !',
            ...doc,
          });
        } else {
          handleMethodException('Mail not verified!');
        }
      } catch (exception) {
        handleMethodException(exception);
      }
    } else {
      handleMethodException('Handler name should be between 5 and 60 characters!');
    }
  },
  'handlers.update': function handlersUpdate(doc) {
    check(doc, {
      _id: String,
      title: String,
      description: String,
      private: Boolean,
    });

    try {
      if (doc.title.length <= 4 || doc.title.length >= 61) {
        throw new Meteor.Error(
          'Invalid name',
          'The name of your handler should contain between 4 and 60 characters.',
        );
      }
      if (doc.description.length <= 5) {
        throw new Meteor.Error(
          'Invalid description',
          'Please provide a description for your handler.',
        );
      }
      if (doc.description.length > 3000) {
        throw new Meteor.Error(
          'Invalid description',
          'Your description is too long (max 3000 chars.).',
        );
      }
      const handlerId = doc._id;
      const docToUpdate = Handlers.findOne(handlerId, {
        fields: { owner: 1, currentVersion: 1 },
      });
      if (!docToUpdate.currentVersion) {
        doc.private = true;
      }

      if (docToUpdate.owner === this.userId || Roles.userIsInRole(this.userId, "admin_enabled")) {
        Handlers.update(handlerId, { $set: doc });
        return handlerId; // Return _id so we can redirect to document after update.
      }

      throw new Meteor.Error('403', "Sorry, pup. You're not allowed to edit this handler.");
    } catch (exception) {
      handleMethodException(exception);
    }
  },
  'handlers.remove': function handlersRemove(handlerId) {
    check(handlerId, String);

    try {
      const docToRemove = Handlers.findOne(handlerId, { fields: { owner: 1 } });

      if (docToRemove.owner === this.userId || Roles.userIsInRole(this.userId, "admin_enabled")) {
        Packages.remove({'meta.handlerId': handlerId});
        Comments.remove({'handlerId': handlerId});
        return Handlers.remove(handlerId);
      }

      throw new Meteor.Error('403', "Sorry, pup. You're not allowed to delete this document.");
    } catch (exception) {
      handleMethodException(exception);
    }
  },
  'handlers.report': function handlersReport(handlerId) {
    check(handlerId, String);

    try {
        const handler = Handlers.findOne(handlerId);
        if(handler){
        Handlers.update(handlerId, { $set: { reports: (handler.reports || 0) + 1 } });
        }else{
          throw new Meteor.Error('404', "Handler not found.");
        }
    } catch (exception) {
      handleMethodException(exception);
    }
  },
});

rateLimit({
  methods: ['handlers.insert', 'handlers.update', 'handlers.remove'],
  limit: 5,
  timeRange: 1000,
});
