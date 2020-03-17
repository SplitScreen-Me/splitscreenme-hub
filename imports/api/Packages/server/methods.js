import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';
import Handlers from '../../Handlers/Handlers';
import handleMethodException from '../../../modules/handle-method-exception';
import Packages from './ServerPackages';

Meteor.methods({
  'packages.findOne': function packagesFindOne(packageId) {
    check(packageId, Match.OneOf(String, undefined));
    try {
      return Packages.collection.findOne(packageId);
    } catch (exception) {
      handleMethodException(exception);
    }
  },
});
