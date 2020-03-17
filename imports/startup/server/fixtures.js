import seeder from '@cleverbeagle/seeder';
import { Meteor } from 'meteor/meteor';
import Handlers from '../../api/Handlers/Handlers';

const documentsSeed = (userId, userName) => ({
  collection: Handlers,
  environments: ['development', 'staging'],
  noLimit: true,
  modelCount: 0,
  model(dataIndex, faker) {
    return {
      owner: userId,
      ownerName: userName,
      title: `Handler ${faker.name.firstName()}`,
      description: `This is the author's description #${dataIndex + 1}`,
      gameName: 'Warcraft III: Reign of Chaos',
      gameDescription:
        'Warcraft 3: Reign of Chaos is an RTS made by Blizzard Entertainment. Take control of either the Humans, the Orcs, the Night Elves or the Undead, all with different unit types and heroes with unique abilities.Play the story driven single player campaign, go online to play default- or custom maps against people around the world or create your own maps with the map creation tool.',
      gameCover: 'ad2vrrlzdsfy3s2fjtgv',
      gameId: 132,
    };
  },
});

seeder(Meteor.users, {
  environments: ['development', 'staging'],
  noLimit: true,
  data: [
    {
      email: 'admin@admin.com',
      password: 'password',
      starredHandlers: [],
      profile: {
        starredHandlers: [],
        username: 'Andy',
      },
      roles: ['admin'],
      data(userId) {
        return documentsSeed(userId, 'Andy');
      },
    },
  ],
});
