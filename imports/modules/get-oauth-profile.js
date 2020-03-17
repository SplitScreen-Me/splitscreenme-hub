import slug from 'slug';

const parseGoogleData = service => ({
  service: 'Google',
  email: service.email,
  name: {
    first: service.given_name,
    last: service.family_name,
  },
  username: slug(service.given_name + ' ' + service.family_name, '_'),
});

const parseGithubData = (profile, service) => {
  const name = profile.name ? profile.name.split(' ') : ['', ''];
  return {
    service: 'GitHub',
    email: service.email,
    name: {
      first: name[0],
      last: name[1],
    },
    username: service.username,
  };
};
const parseDiscordData = (profile, service) => {
  return {
    service: 'Discord',
    email: profile.email,
    name: {
      first: profile.username,
      last: profile.discriminator,
    },
    username: profile.username,
  };
};

const parseFacebookData = service => ({
  service: 'Facebook',
  email: service.email,
  name: {
    first: service.first_name,
    last: service.last_name,
  },
  username: slug(service.first_name + ' ' + service.last_name, '_'),
});

const getDataForService = (options, services) => {
  if (services.facebook) {
    return parseFacebookData(services.facebook);
  }
  if (services.github) {
    return parseGithubData(options, services.github);
  }
  if (services.google) {
    return parseGoogleData(services.google);
  }
  if (services.discord) {
    return parseDiscordData(services.discord);
  }
  return null;
};

export default (options = { password: false }, user) => {
  const isOAuth = !options.password;
  const serviceData = isOAuth ? getDataForService(options, user.services) : null;
  return isOAuth ? serviceData : null;
};
