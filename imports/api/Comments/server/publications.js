import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import Comments from '../Comments';

Meteor.publish(
  'comments.byHandler',
  handlerId => {
    check(handlerId, String);
    return Comments.find(
      { handlerId: handlerId },
      {
        sort: { createdAt: -1 },
      },
    );
  },
  {
    url: 'api/v1/comments/:0',
    httpMethod: 'get',
  },
);
