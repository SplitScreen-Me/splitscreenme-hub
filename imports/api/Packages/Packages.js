import { Meteor } from 'meteor/meteor';
import { FilesCollection } from 'meteor/ostrio:files';
import Handlers from '../Handlers/Handlers';


const Packages = new FilesCollection({
  collectionName: 'packages',
  allowClientCode: false,
  debug: Meteor.isServer && process.env.NODE_ENV === 'development',
  onBeforeUpload(file) {
    const handler = Handlers.findOne(file.meta.handlerId);
    if (handler.owner !== this.userId) {
      if(!Roles.userIsInRole(this.userId, "admin_enabled")) return "This handler doesn't belong to you";
    }
    if (file.meta.releaseDescription.length < 2) {
      return 'Please provide a description for the release.';
    }
    if (file.size <= 31457280 && /nc|zip/i.test(file.extension)) {
      return true;
    }
    return 'Please upload package, with size equal or less than 30MB';
  },
});

Packages.collection.allow({
  insert: () => false,
  update: () => false,
  remove: () => false,
});

Packages.collection.deny({
  insert: () => true,
  update: () => true,
  remove: () => true,
});

Packages.collection.attachSchema(Packages.schema);
export default Packages;