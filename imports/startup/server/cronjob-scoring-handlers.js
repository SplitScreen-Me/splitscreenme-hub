import { Meteor } from 'meteor/meteor';
import Handlers from '../../api/Handlers/Handlers';
import HandlersStats from '../../api/HandlersStats/HandlersStats';

// A wait function to delay between scorings :
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const scoreNextHandler = async () => {
  const handler = await Handlers.findOne({}, { sort: { trendScoreLastUpdate: 1 }, limit: 1, fields: {title:1} });
  if (handler) {
    // Get the handler score
    const lastThreeDaysOfDownloads = await HandlersStats.find({
      handlerId: handler._id,
      date: { $gte: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
    }).fetch();
    const score = lastThreeDaysOfDownloads.reduce((acc, day) => acc + day.downloads, 0);
    // Update the handler
    await Handlers.update(
      { _id: handler._id },
      { $set: { trendScore: score, trendScoreLastUpdate: new Date() } },
    );
  }
};
Meteor.startup(() => {
  Meteor.setTimeout(async () => {
    // Waiting for server startup...
    console.log("Starting scoring handlers loop !");
    while (true) {
      try {
        await scoreNextHandler();
      }catch (e) {
        console.log("error while scoring " + e.toString());
      }
      await wait(1000);
    }
  }, 5000);
});
