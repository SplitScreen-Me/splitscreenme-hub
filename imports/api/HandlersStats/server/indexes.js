import createIndex from '../../../modules/server/create-index';
import HandlersStats from '../HandlersStats';

createIndex(HandlersStats, { date: 1, handlerId: 1 });
