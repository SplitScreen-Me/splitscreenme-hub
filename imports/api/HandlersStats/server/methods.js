import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import handleMethodException from '../../../modules/handle-method-exception';
import HandlersStats from '../HandlersStats';
import Packages from '../../Packages/server/ServerPackages';

Meteor.methods({
  'handlersStats.findOne': function handlersStatsFindOne(handlerId) {
    check(handlerId, String);
    try {
      const statsDownloads = HandlersStats.find(
        { handlerId },
        {
          sort: { date: -1 },
          limit: 365,
        },
      ).fetch();
      const statsPackages = Packages.collection.find({ 'meta.handlerId': handlerId }, {sort: { 'meta.releaseDate': -1 }}).fetch();
      return { statsDownloads, statsPackages };
    } catch (exception) {
      handleMethodException(exception);
    }
  },
});
