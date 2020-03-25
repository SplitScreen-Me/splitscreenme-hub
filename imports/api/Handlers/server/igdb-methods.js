/* eslint-disable consistent-return */

import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';
import axios from 'axios';
import handleMethodException from '../../../modules/handle-method-exception';
import rateLimit from '../../../modules/rate-limit';

const igdbApi = axios.create({
  baseURL: 'https://api-v3.igdb.com/',
  timeout: 2500,
  headers: {
    'user-key': Meteor.settings.private.IGDB_API_KEY,
    'Content-Type': 'text/plain',
    Accept: 'application/json',
  },
});
Meteor.methods({
  'handlers.seekGame': function handlersSeekGame(gameName, searchFilter = true) {
    check(gameName, Match.OneOf(String, undefined));
    check(searchFilter, Match.Maybe(Boolean, null));
    return igdbApi
      .post(
        'games',
        'fields *, cover.*; search "' +
          gameName.replace(/"/g, '\\"') +
          '";' + ((searchFilter === true) || (typeof searchFilter === "object") ? 'where platforms = (6);' : '') + 'limit 15;',
      )
      .then(
        response => {
          return response.data;
        },
        error => {
          handleMethodException(error);
        },
      );
  },
});

rateLimit({
  methods: ['handlers.seekGame'],
  limit: 2,
  timeRange: 5000,
});
