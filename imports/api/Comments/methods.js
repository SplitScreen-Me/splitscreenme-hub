/* eslint-disable consistent-return */

import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';
import Comments from './Comments';
import { Roles } from 'meteor/alanning:roles';
import handleMethodException from '../../modules/handle-method-exception';
import rateLimit from '../../modules/rate-limit';
import Handlers from '../Handlers/Handlers';
import { discord_admin_log } from "../../modules/server/discord-logging";
import sendReplyEmail from './server/send-reply-email';

Meteor.methods({
  'comments.insert': function commentsInsert(doc) {
    console.log(doc);
    check(doc, {
      content: String,
      handlerId: String,
      replyTo: Match.Maybe(String),
    });
    if (doc.content.length >= 4 && doc.content.length <= 800) {
      try {
        const user = Meteor.users.findOne({ _id: this.userId });
        if ((user.emails && user.emails[0] && user.emails[0].verified) || !user.services.password) {
          const handler = Handlers.findOne(doc.handlerId);
          if (handler.owner) {
            Handlers.update(doc.handlerId, {
              $set: { commentCount: handler.commentCount + 1 },
            });
            discord_admin_log("New comment", `${Meteor.user().profile.username} added a comment on handler ${handler?.title} : https://hub.splitscreen.me/handler/${doc.handlerId} .`);
            if(doc.replyTo?.length > 0) {
            const repliedToUserId = Comments.findOne(doc.replyTo)?.owner;
            if(repliedToUserId !== Meteor.userId()) {
            sendReplyEmail(repliedToUserId, handler.title, `${doc.content.substring(0,50)}...`, `https://hub.splitscreen.me/handler/${doc.handlerId}`)
            }
            }
              return Comments.insert({
              owner: this.userId,
              ownerName: user.profile.username,
              ...doc,
            });
          } else {
            handleMethodException('Invalid Handler Id!');
          }
        } else {
          handleMethodException('Mail not verified!');
        }
      } catch (exception) {
        handleMethodException(exception);
      }
    } else {
      handleMethodException('Comments can be between 4 and 300 characters!');
    }
  },
  'comments.remove': function commentsRemove(commentId) {
    check(commentId, String);
    try {
      const docToRemove = Comments.findOne(commentId, {
        fields: { owner: 1, handlerId: 1, content:1, ownerName: 1 },
      });

      if (docToRemove.owner === this.userId || Roles.userIsInRole(this.userId, "admin_enabled")) {
        const handler = Handlers.findOne(docToRemove.handlerId);
        if (handler.owner) {
          const repliedComments = Comments.find({ replyTo: commentId }).fetch();
          Handlers.update(docToRemove.handlerId, {
            $set: { commentCount: handler.commentCount - (1 + repliedComments.length) },
          });
          discord_admin_log("Comment removed", `${Meteor.user().profile.username} removed a comment by ${docToRemove.ownerName} on handler ${handler?.title} : https://hub.splitscreen.me/handler/${docToRemove.handlerId}, saying : ${docToRemove.content}`);
          return Comments.remove({ $or:[{_id: commentId }, { replyTo: commentId }] });
        } else {
          handleMethodException('Invalid Handler Id!');
        }
      }
      throw new Meteor.Error('403', "Sorry, pup. You're not allowed to delete this comment.");
    } catch (exception) {
      handleMethodException(exception);
    }
  },
});

rateLimit({
  methods: ['comments.insert', 'comments.remove'],
  limit: 1,
  timeRange: 5000,
});
