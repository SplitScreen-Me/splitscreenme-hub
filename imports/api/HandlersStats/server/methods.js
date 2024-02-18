import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import handleMethodException from '../../../modules/handle-method-exception';
import HandlersStats from '../HandlersStats';

Meteor.methods({
  'handlersStats.findOne': function handlersStatsFindOne(handlerId) {
    check(handlerId, String);
    try {
      const stats = HandlersStats.find(
        { handlerId },
        {
          sort: { date: -1 },
          limit: 365,
        },
      ).fetch();
      return stats;
    } catch (exception) {
      handleMethodException(exception);
    }
  },
});
