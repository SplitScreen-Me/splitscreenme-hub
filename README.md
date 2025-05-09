# SplitScreen.Me Hub 📦

<img src="https://www.splitscreen.me/img/splitscreen-me-logo.png" alt="SplitScreen.Me Logo" width="100" height="100"></img>

![CI/CD](https://github.com/SplitScreen-Me/splitscreenme-hub/workflows/CI/badge.svg)
![Swag](https://img.shields.io/badge/swag-100%25-green)
![Love](https://img.shields.io/badge/Love-MUCH-ff69b4)

## About the Hub 📦

The Hub is created using [Meteor](https://www.meteor.com/), [React](https://www.reactjs.org), [Antd Design](https://ant.design/).

Feel free to [contribute](#contribute) and help us build the most amazing **hub for splitscreened games** ever!

## Basic API 🔥

Handler research:

```json
url: "api/v1/handlers/:search_text",
httpMethod: "get"
```

Get all handlers (up to 500):

```json
url: "api/v1/allhandlers",
httpMethod: "get"
```

Specific handler infos:

```json
url: "api/v1/handler/:handler_id",
httpMethod: "get"
```

Get available packages for one handler:

```json
url: "api/v1/packages/:handler_id",
httpMethod: "get"
```

Get package info:

```json
url: "api/v1/packages/:package_id",
httpMethod: "get"
```

Get comments done by users about a handler:

```json
url: "api/v1/comments/:handler_id",
httpMethod: "get"
```

Download a package from it's ID:

```json
url: /cdn/storage/packages/:package_id/original/handler-{handler_id}-v{version_of_handler}.nc?download=true
httpMethod: "get"
```

Get IGDB screenshots for a handler:

```json
url: "api/v1/screenshots/:handler_id",
httpMethod: "get"
```

## Contribute

### Prerequisites

1. IDE or text editor. for example [WebStorm](https://www.jetbrains.com/webstorm/) or [VSCode](https://code.visualstudio.com/)
2. IDE for MongoDB, we recommend [NoSQLBooster](https://nosqlbooster.com/)

#### Installation

You must use Node v12 and not a higher version.

```sh
npm install
```

#### Local Development

```sh
npm run dev
```

This command starts a local development server and open up a browser window. Most changes are reflected live without having to restart the server.
