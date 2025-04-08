import { Meteor } from 'meteor/meteor';
import axios from 'axios';

// authenticate with GitHub API
Meteor.startup(() => {
  Meteor.setInterval(() => {
    axios
      .get('https://api.github.com/rate_limit')
      .then(response => {
        if (response.data.resources.core.remaining < 10) {
          console.log('GitHub API rate limit reached, refreshing token.');
          axios.defaults.headers.common.Authorization = `token ${Meteor.settings.private.GITHUB_API_TOKEN}`;
        }
      })
      .catch(error => {
        console.log(error);
      });
  }, 1000 * 60 * 60 * 24 * 10);
});

/** Get the total download count of all release assets in a GitHub repository */
export const getGitHubDownloads = async (owner, repo) => {
  let downloadCount = 0;
  let page = 1;
  let hasMore = true;

  try {
    while (hasMore) {
      const response = await axios.get(`https://api.github.com/repos/${owner}/${repo}/releases`, {
        params: {
          page,
          per_page: 100, // Max items per page (GitHub's limit)
        },
        headers: {
          'User-Agent': 'Your-App-Name', // GitHub requires this
          Accept: 'application/vnd.github.v3+json',
          // Uncomment for authenticated requests (recommended):
          // Authorization: `token ${process.env.GITHUB_TOKEN}`
        },
      });

      const releases = response.data;

      // No more releases (empty array)
      if (releases.length === 0) {
        hasMore = false;
        break;
      }

      // Sum downloads from all assets
      for (const release of releases) {
        for (const asset of release.assets) {
          downloadCount += asset.download_count;
        }
      }

      // Check for pagination (GitHub uses Link headers)
      const linkHeader = response.headers.link;
      hasMore = linkHeader?.includes('rel="next"');
      page++;
    }

    return downloadCount;
  } catch (error) {
    // Handle rate limits (403) and other errors
    if (error.response?.status === 403) {
      const resetTime = new Date(error.response.headers['x-ratelimit-reset'] * 1000);
      console.error(`GitHub API rate limited. Resets at: ${resetTime}`);
    } else {
      console.error('GitHub API error:', error.message);
    }
    return 0; // Fallback value
  }
};

/** Get the star count of a GitHub repository */
export const getGitHubStars = async (owner, repo) => {
  try {
    const data = await axios.get(`https://api.github.com/repos/${owner}/${repo}`);
    return data.data.stargazers_count;
  } catch (e) {
    console.log(e);
    return 0;
  }
};
