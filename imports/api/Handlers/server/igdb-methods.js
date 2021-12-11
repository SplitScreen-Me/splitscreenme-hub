/* eslint-disable consistent-return */

import { Meteor } from 'meteor/meteor';
import { HTTP } from 'meteor/http';
import { check, Match } from 'meteor/check';
import axios from 'axios';
import handleMethodException from '../../../modules/handle-method-exception';
import rateLimit from '../../../modules/rate-limit';

export let bearerToken = '';

const refreshBearer = () => {
  HTTP.call(
    'POST',
    'https://id.twitch.tv/oauth2/token',
    {
      params: {
        client_id: Meteor.settings.private.IGDB_API_ID,
        client_secret: Meteor.settings.private.IGDB_API_KEY,
        grant_type: 'client_credentials',
      },
    },
    (err, res) => {
      if (err) {
        console.log(err);
      }
      if (res.data && res.data.access_token) {
        console.log('Acces token correctly refreshed.');
        bearerToken = res.data.access_token;
      }
    },
  );
  console.log('Refreshing bearer token from IGDB Api');
};

Meteor.startup(() => {
  Meteor.setInterval(() => {
    refreshBearer();
  }, 10 * 24 * 60 * 60 * 1000); // Renew every 10 days.
  refreshBearer();
});

Meteor.methods({
  'handlers.seekGame': function handlersSeekGame(gameName, searchFilter = true) {
    check(gameName, Match.OneOf(String, undefined));
    check(searchFilter, Match.Maybe(Boolean, null));

    const igdbApi = axios.create({
      baseURL: 'https://api.igdb.com/v4/',
      timeout: 2500,
      headers: {
        'Client-ID': Meteor.settings.private.IGDB_API_ID,
        Authorization: `Bearer ${bearerToken}`,
        'Content-Type': 'text/plain',
        Accept: 'application/json',
      },
    });

    return igdbApi
      .post(
        'games',
        'fields *, cover.*; search "' +
          gameName.replace(/"/g, '\\"') +
          '";' +
          (searchFilter === true || typeof searchFilter === 'object'
            ? 'where platforms = (6);'
            : '') +
          'limit 15;',
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
