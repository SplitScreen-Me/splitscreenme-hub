/* eslint-disable consistent-return */

import { Mongo } from 'meteor/mongo';
import SimpleSchema from 'simpl-schema';

const Comments = new Mongo.Collection('Comments');

Comments.allow({
  insert: () => false,
  update: () => false,
  remove: () => false,
});

Comments.deny({
  insert: () => true,
  update: () => true,
  remove: () => true,
});

Comments.schema = new SimpleSchema({
  owner: {
    type: String,
    label: 'The ID of the user this comment belongs to.',
  },
  handlerId: {
    type: String,
    label: "The handler's ID this comment belongs to.",
  },
  ownerName: {
    type: String,
    label: 'The name of the user this comment belongs to.',
  },
  createdAt: {
    type: String,
    label: 'The date this comment was created.',
    autoValue() {
      if (this.isInsert) {
        return new Date().toISOString();
      }
    },
  },
  content: {
    type: String,
    label: 'The comment on the handler.',
  },
});

Comments.attachSchema(Comments.schema);

export default Comments;
