import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import Handlers from '../Handlers';
import escapeRegExp from "../../../modules/regexescaper";
import Packages from "../../Packages/server/ServerPackages";

Meteor.publish(
  'handlers',
  function handlers(handlerTitleSearch = '', handlerOptionSearch = 'hot', handlerSortOrder = 'down', limit = 18) {
    let sortObject = { stars: handlerSortOrder === "up" ? 1 : -1 };
    if (handlerOptionSearch === 'download') {
      sortObject = { downloadCount:  handlerSortOrder === "up" ? 1 : -1 };
    }
    if (handlerOptionSearch === 'latest') {
      sortObject = { createdAt:  handlerSortOrder === "up" ? 1 : -1 };
    }
    if (handlerOptionSearch === 'report') {
      sortObject = { reports:  handlerSortOrder === "up" ? 1 : -1 };
    }
    return Handlers.find(
      {
        gameName: { $regex: new RegExp(escapeRegExp(handlerTitleSearch)), $options: 'i' },
        private: false,
      },
      {
        sort: sortObject,
        limit: Math.min(limit, 500),
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
    { owner: userId, private: false },
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

WebApp.connectHandlers.use('/api/v1/totalDownloadCountEver', async (req, res, next) => {
  res.writeHead(200);
  let sum = 0;
  const allPackages = Packages.collection.find({}).fetch();
  allPackages.forEach(pkg => {
    if (pkg.meta.downloads > 0) sum = sum + pkg.meta.downloads;
  });
  res.end(`Total downloads: ${sum}`);
});

Meteor.publish('handlers.edit', function handlersEdit(documentId) {
  check(documentId, String);
  return Handlers.find({ _id: documentId, owner: this.userId });
});

Meteor.publish(
  'handlers.webdisplay',
  function handlers() {
    return Handlers.find(
      { private: false },
      {
        sort: { downloadCount: -1 },
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
      },
      {
        sort: {stars: -1},
        limit: 500,
      },
    );
  },
  {
    url: 'api/v1/allhandlers',
    httpMethod: 'get',
  },
);