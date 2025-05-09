import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import Handlers from '../Handlers';
import Comments from '../../Comments/Comments';
import escapeRegExp from '../../../modules/regexescaper';
import Packages from '../../Packages/server/ServerPackages';
import axios from 'axios';
import { bearerToken } from './igdb-methods';
import { getGitHubStars, getGitHubDownloads } from './github-methods';
import formatNumbers from '../../../modules/formatNumbers';

Meteor.publish(
  'handlers',
  function handlers(
    handlerTitleSearch = '',
    handlerOptionSearch = 'trend',
    handlerSortOrder = 'down',
    limit = 18,
    localHandlerIds = [],
  ) {
    const isSearchFromArray = localHandlerIds.length > 0;

    let sortObject = { trendScore: handlerSortOrder === 'up' ? 1 : -1 };

    if (handlerOptionSearch === 'hot') {
      sortObject = { stars: handlerSortOrder === 'up' ? 1 : -1 };
    }
    if (handlerOptionSearch === 'download') {
      sortObject = { downloadCount: handlerSortOrder === 'up' ? 1 : -1 };
    }
    if (handlerOptionSearch === 'latest' || handlerOptionSearch === 'unauthorized') {
      sortObject = { createdAt: handlerSortOrder === 'up' ? 1 : -1 };
    }
    if (handlerOptionSearch === 'report') {
      sortObject = { reports: handlerSortOrder === 'up' ? 1 : -1 };
    }
    if (handlerOptionSearch === 'alphabetical') {
      sortObject = { gameName: handlerSortOrder === 'up' ? -1 : 1 };
    }
    const searchInArraySelectorCondition =
      isSearchFromArray > 0 ? { _id: { $in: localHandlerIds } } : {};

    return Handlers.find(
      {
        ...searchInArraySelectorCondition,
        gameName: { $regex: new RegExp(escapeRegExp(handlerTitleSearch)), $options: 'gi' },
        private: false,
        publicAuthorized: handlerOptionSearch !== 'unauthorized',
      },
      {
        sort: sortObject,
        limit: Math.min(isSearchFromArray ? localHandlerIds.length : limit, 600),
      },
    );
  },
  {
    url: 'api/v1/handlers/:0',
    httpMethod: 'get',
  },
);

Meteor.publish('handlers.mine', function handlersMine() {
  return Handlers.find(
    { owner: this.userId },
    {
      sort: { createdAt: -1 },
    },
  );
});
Meteor.publish('handlers.user', function handlersUser(userId) {
  return Handlers.find(
    { owner: userId, private: false, publicAuthorized: true },
    {
      sort: { createdAt: -1 },
    },
  );
});

// Note: documents.view is also used when editing an existing document.
Meteor.publish(
  'handlers.view',
  handlerId => {
    check(handlerId, String);
    return Handlers.find({ _id: handlerId });
  },
  {
    url: 'api/v1/handler/:0',
    httpMethod: 'get',
  },
);

/* This code is a PoC, its dirty */
const screenshotsCache = {};

WebApp.connectHandlers.use('/api/v1/screenshots', async (req, res, next) => {
  res.writeHead(200);
  const handlerId = req.url.split('/')[1];
  if (handlerId.length > 0) {
    const handler = await Handlers.findOne({ _id: handlerId }, { fields: { gameId: 1 } });
    if (!handler?.gameId) {
      res.end(JSON.stringify({ error: 'Incorrect handlerId' }));
      return;
    }

    if (!screenshotsCache[handler.gameId]) {
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
      const igdbAnswer = await igdbApi.post(
        'screenshots',
        `fields *;where game = ${handler.gameId};`,
      );
      screenshotsCache[handler.gameId] = igdbAnswer.data;
    }
    res.end(JSON.stringify({ screenshots: screenshotsCache[handler.gameId] }));
  } else {
    res.end(JSON.stringify({ error: 'No handler ID provided' }));
  }
  res.end(JSON.stringify({ error: 'Unknown error' }));
});
/* End of dirty PoC */

WebApp.connectHandlers.use('/api/v1/hubstats', async (req, res, next) => {
  res.writeHead(200);
  let downloadsSum = 0;
  let hotnessSum = 0;
  // TODO: Store these in a database and update it every few hours
  const totalNucleusCoopGitHubStars =
    (await getGitHubStars('SplitScreen-Me', 'splitscreenme-nucleus')) +
    (await getGitHubStars('ZeroFox5866', 'nucleuscoop')) +
    (await getGitHubStars('nucleuscoop', 'nucleuscoop')) +
    (await getGitHubStars('distrohelena', 'nucleuscoop'));
  const totalNucleusCoopGitHubDownloads =
    (await getGitHubDownloads('SplitScreen-Me', 'splitscreenme-nucleus')) +
    (await getGitHubDownloads('ZeroFox5866', 'nucleuscoop')) +
    (await getGitHubDownloads('nucleuscoop', 'nucleuscoop')) +
    (await getGitHubDownloads('distrohelena', 'nucleuscoop'));

  const allPackages = Packages.collection.find({}).fetch();
  for (pkg of allPackages) {
    if (pkg.meta.downloads > 0) {
      downloadsSum = downloadsSum + pkg.meta.downloads;
    }
  }
  const allHandlers = Handlers.find({ private: false }).fetch();
  for (const hndl of allHandlers) {
    if (hndl.stars > 0) {
      hotnessSum = hotnessSum + hndl.stars;
    }
  }

  const allUsers = Meteor.users.find({}).fetch();
  const usersCount = allUsers.length;

  const usersWithHandlersCount = Meteor.users
    .find({ 'profile.handlerId': { $exists: true } })
    .fetch().length;

  const allComments = Comments.find({}).fetch();
  const commentsCount = allComments.length;

  res.end(
    `Total downloads: ${formatNumbers(downloadsSum)}` +
      `\nTotal hotness: ${formatNumbers(hotnessSum)}` +
      `\nTotal handlers: ${formatNumbers(allHandlers.length)}` +
      `\nTotal users: ${formatNumbers(usersCount)}` +
      `\nTotal handler authors: ${formatNumbers(usersWithHandlersCount)}` +
      `\nTotal comments ${formatNumbers(commentsCount)}` +
      `\nTotal Nucleus Co-Op GitHub stars: ${formatNumbers(totalNucleusCoopGitHubStars)}` +
      `\nTotal Nucleus Co-Op GitHub downloads: ${formatNumbers(totalNucleusCoopGitHubDownloads)}`,
  );
});

Meteor.publish('handlers.edit', function handlersEdit(documentId) {
  check(documentId, String);
  return Handlers.find({ _id: documentId, owner: this.userId });
});

Meteor.publish(
  'handlers.webdisplay',
  function handlers() {
    return Handlers.find(
      { private: false, publicAuthorized: true },
      {
        sort: { trendScore: -1 },
        limit: 15,
      },
    );
  },
  {
    url: 'api/v1/handlerswebdisplay',
    httpMethod: 'get',
  },
);

Meteor.publish(
  'handlers.full',
  function handlersFull() {
    return Handlers.find(
      {
        private: false,
        publicAuthorized: true,
      },
      {
        sort: { stars: -1 },
        limit: 600,
      },
    );
  },
  {
    url: 'api/v1/allhandlers',
    httpMethod: 'get',
  },
);
