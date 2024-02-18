/* eslint-disable consistent-return */

import { Mongo } from 'meteor/mongo';
import SimpleSchema from 'simpl-schema';

const HandlersStats = new Mongo.Collection('HandlersStats');

HandlersStats.allow({
  insert: () => false,
  update: () => false,
  remove: () => false,
});

HandlersStats.deny({
  insert: () => true,
  update: () => true,
  remove: () => true,
});

HandlersStats.schema = new SimpleSchema({
  date: {
    type: Date,
    label: "The date, which is today's date but at midnight and in local timezone (not UTC).",
  },
  handlerId: {
    type: String,
    label: 'The ID of the related handler.',
  },
  downloads: {
    type: Number,
    label: 'The total number of downloads for the associated date.',
  },
});

HandlersStats.attachSchema(HandlersStats.schema);

export default HandlersStats;
