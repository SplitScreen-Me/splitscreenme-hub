import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import Packages from './ServerPackages';

Meteor.publish(
  'packages.view',
  packageId => {
    check(packageId, String);
    return Packages.collection.find({ _id: packageId });
  },
  {
    url: 'api/v1/package/:0',
    httpMethod: 'get',
  },
);
Meteor.publish(
  'packages.viewforhandler',
  handlerId => {
    check(handlerId, String);
    return Packages.collection.find({ 'meta.handlerId': handlerId });
  },
  {
    url: 'api/v1/packages/:0',
    httpMethod: 'get',
  },
);
Meteor.publish('files.packages.all', function() {
  return Packages.find().cursor;
});
