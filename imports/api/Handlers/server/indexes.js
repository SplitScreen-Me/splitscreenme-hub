import createIndex from '../../../modules/server/create-index';
import Handlers from '../Handlers';

createIndex(Handlers, { owner: 1 });
createIndex(Handlers, { trendScore: 1 });
createIndex(Handlers, { trendScoreLastUpdate: 1 });
