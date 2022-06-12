import { Meteor } from 'meteor/meteor';
import { FilesCollection } from 'meteor/ostrio:files';
import { Roles } from 'meteor/alanning:roles';
import Grid from 'gridfs-stream';
import { MongoInternals } from 'meteor/mongo';
import JSZip from 'jszip';
import fs from 'fs';
import prettier from "prettier/standalone";
import parserBabel from "prettier/parser-babylon";
import handleMethodException from '../../../modules/handle-method-exception';
import Handlers from '../../Handlers/Handlers';
import { d_aLog } from "../../../modules/server/discord-logging";

let gfs;
if (Meteor.isServer) {
  gfs = Grid(MongoInternals.defaultRemoteCollectionDriver().mongo.db, MongoInternals.NpmModule);
}

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
  onAfterUpload(pkg) {
    // Move file to GridFS
    const handler = Handlers.findOne(pkg.meta.handlerId);
    const newVersion = parseInt(handler.currentVersion) + 1;
    const uploadUser = Meteor.users.findOne(pkg.userId);
    const prettierConfig = {
      arrowParens: 'avoid',
      bracketSpacing: true,
      htmlWhitespaceSensitivity: 'css',
      insertPragma: false,
      jsxBracketSameLine: false,
      jsxSingleQuote: false,
      printWidth: 200,
      proseWrap: 'preserve',
      quoteProps: 'as-needed',
      requirePragma: false,
      semi: true,
      singleQuote: false,
      tabWidth: 2,
      trailingComma: 'none',
      useTabs: false,
      parser: 'babel',
      plugins: [parserBabel]
    }
    fs.readFile(pkg.path, (err, data) => {
      if (err) {
        throw err;
      }
      JSZip.loadAsync(data).then(zip => {
        try {
          zip
            .file('handler.js')
            .async('string')
            .then(data => {
              data = prettier.format(data, prettierConfig);
              data = data.replace(/^Hub\.Handler\.Version.*\R?/gim, '');
              data = data.replace(/^Hub\.Maintainer\.Id.*\R?/gim, '');
              data = data.replace(/^Hub\.Maintainer\.Name.*\R?/gim, '');
              data = data.replace(/^Hub\.Handler\.Id.*\R?/gim, '');
              const currDate = new Date();
              data = 'Hub.Maintainer.Id = "' + pkg.userId + '";\n\n' + data;
              data = 'Hub.Maintainer.Name = "' + uploadUser.profile.username + '";\n' + data;
              data = 'Hub.Handler.Id = "' + pkg.meta.handlerId + '";\n' + data;
              data =
                'Hub.Handler.Version = ' +
                newVersion +
                ';       // Released at https://hub.splitscreen.me/ on ' +
                currDate.toString() +
                '.\n' +
                data;
              data = prettier.format(data, prettierConfig);
              zip.file('handler.js', data);

              Object.keys(pkg.versions).forEach(versionName => {
                const metadata = {
                  versionName,
                  pkgId: pkg._id,
                  storedAt: new Date(),
                }; // Optional
                const writeStream = gfs.createWriteStream({
                  filename: pkg.name,
                  metadata,
                });

                zip
                  .generateNodeStream({
                    type: 'nodebuffer',
                    streamFiles: true,
                    compression: 'DEFLATE',
                    compressionOptions: { level: 9 },
                  })
                  .pipe(writeStream);
                writeStream.on(
                  'close',
                  Meteor.bindEnvironment(file => {
                    const property = `versions.${versionName}.meta.gridFsFileId`;

                    // If we store the ObjectID itself, Meteor (EJSON?) seems to convert it to a
                    // LocalCollection.ObjectID, which GFS doesn't understand.
                    this.collection.update(pkg._id, {
                      $set: {
                        [property]: file._id.toString(),
                        'meta.jsContent': data,
                        'meta.handlerVersion': newVersion,
                        'meta.ownerId': uploadUser._id,
                        'meta.releaseDate': new Date(),
                      },
                    });

                    this.unlink(this.collection.findOne(pkg._id), versionName); // Unlink files from FS
                  }),
                );
              });
              Handlers.update(pkg.meta.handlerId, {
                $set: { currentVersion: newVersion, currentPackage: pkg._id, verified: false },
              });
              d_aLog("Package publication", `${uploadUser.profile.username} published a new package for handler ${handler.title} ${handler.gameName} (${handler._id}).`);
            });
        } catch (exception) {
          this.remove(pkg._id);
          throw exception;
        }
      });
    });
    console.log(pkg);
  },
  interceptDownload(http, pkg, versionName) {
    // Serve file from GridFS
    const _id = (pkg.versions[versionName].meta || {}).gridFsFileId;
    if (_id) {
      const readStream = gfs.createReadStream({ _id });
      readStream.on('error', err => {
        throw err;
      });
      readStream.pipe(http.response);
    }
    return Boolean(_id); // Serve file from either GridFS or FS if it wasn't uploaded yet
  },
  onAfterRemove(pkgs) {
    // Remove corresponding file from GridFS
    pkgs.forEach(pkg => {
      Object.keys(pkg.versions).forEach(versionName => {
        const _id = (pkg.versions[versionName].meta || {}).gridFsFileId;
        if (_id) {
          gfs.remove({ _id }, err => {
            if (err) {
              throw err;
            }
          });
        }
      });
    });
  },
  downloadCallback(fileObj) {
    if (this.params.query.download === 'true') {
      // Increment downloads counter
      Packages.update(fileObj._id, { $inc: { 'meta.downloads': 1 } });
      Handlers.update(fileObj.meta.handlerId, { $inc: { downloadCount: 1 } });
    }
    // Must return true to continue download
    return true;
  },
});

Packages.denyClient();

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