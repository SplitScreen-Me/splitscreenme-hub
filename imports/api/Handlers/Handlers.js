/* eslint-disable consistent-return */

import { Mongo } from 'meteor/mongo';
import SimpleSchema from 'simpl-schema';

const Handlers = new Mongo.Collection('Handlers');

Handlers.allow({
  insert: () => false,
  update: () => false,
  remove: () => false,
});

Handlers.deny({
  insert: () => true,
  update: () => true,
  remove: () => true,
});

Handlers.schema = new SimpleSchema({
  owner: {
    type: String,
    label: 'The ID of the user this handler belongs to.',
  },
  ownerName: {
    type: String,
    label: 'The name of the user this handler belongs to.',
  },
  createdAt: {
    type: String,
    label: 'The date this handler was created.',
    autoValue() {
      if (this.isInsert) {
        return new Date().toISOString();
      }
    },
  },
  updatedAt: {
    type: String,
    label: 'The date this handler was last updated.',
    autoValue() {
      if (this.isInsert || this.isUpdate) {
        return new Date().toISOString();
      }
    },
  },
  title: {
    type: String,
    label: 'The title of the handler.',
  },
  description: {
    type: String,
    label: 'The description of the handler.',
  },
  gameName: {
    type: String,
    label: 'The name of the game.',
  },
  gameDescription: {
    type: String,
    label: 'The description of the game.',
  },
  gameCover: {
    type: String,
    label: 'The cover id of the game.',
  },
  gameId: {
    type: Number,
    label: 'The IGDB id of the game.',
  },
  gameUrl: {
    type: String,
    label: 'The IGDB url of the game.',
  },
  stars: {
    type: Number,
    label: 'The stars of the handler.',
    autoValue() {
      if (this.isInsert) {
        return 0;
      }
    },
  },
  downloadCount: {
    type: Number,
    label: 'Total downloads of the handler.',
    autoValue() {
      if (this.isInsert) {
        return 0;
      }
    },
  },
  verified: {
    type: Boolean,
    label: 'Is the last version verified.',
    autoValue() {
      if (this.isInsert) {
        return false;
      }
    },
  },
  private: {
    type: Boolean,
    label: 'Is the handler private.',
    autoValue() {
      if (this.isInsert) {
        return true;
      }
    },
  },
  lastPublicationAt: {
    type: Date,
    label: 'Last time this went public.',
    required: false
  },
  commentCount: {
    type: Number,
    label: 'The number of comments for the handler.',
    autoValue() {
      if (this.isInsert) {
        return 0;
      }
    },
  },
  currentVersion: {
    type: Number,
    label: 'Current version of the handlers.',
    autoValue() {
      if (this.isInsert) {
        return 0;
      }
    },
  },
  currentPackage: {
    type: String,
    label: 'Current package id of the handler latest version.',
    required: false,
  },
  lastJs: {
    type: String,
    label: 'Current JS of the handler latest version.',
    required: false,
  },
  reports: {
    type: Number,
    label: 'Number of reports on this handler.',
    autoValue() {
      if (this.isInsert) {
        return 0;
      }
    },
  },
});

Handlers.attachSchema(Handlers.schema);

export default Handlers;
