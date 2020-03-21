# SplitScreen.Me Hub 📦
<img src="https://www.splitscreen.me/img/splitscreen-me-logo.png" alt="SplitScreen.Me Logo" width="100" height="100"></img>

![CI/CD](https://github.com/SplitScreen-Me/splitscreenme-hub/workflows/CI/badge.svg)
![Swag](https://img.shields.io/badge/swag-100%25-green)
![Love](https://img.shields.io/badge/Love-MUCH-ff69b4)

## About the Hub 📦

The Hub is created using [Meteor](https://www.meteor.com/), [React](reactjs.org), [Antd Design](https://ant.design/), and a lot of goodies ([meteor-webpack](https://github.com/ardatan/meteor-webpack) & [React hmr rewire](https://github.com/gaearon/react-hot-loader), ...).

Feel free to **contribute & help** us build the most amazing **hub for splitscreened games** ever !

## Basic API 🔥

Handler research:
```
url: "api/v1/handlers/:search_text",
httpMethod: "get"
```

Specific handler infos:
```
url: "api/v1/handler/:handler_id",
httpMethod: "get"
```

Get available packages for one handler:
```
url: "api/v1/packages/:handler_id",
httpMethod: "get"
```

Get package info:
```
url: "api/v1/packages/:package_id",
httpMethod: "get"
```
                     
Get comments done by users about a handler:
```
url: "api/v1/comments/:handler_id",
httpMethod: "get"
```
                     
Download a package from it's ID:
```
url: /cdn/storage/packages/:package_id/original/handler-{handler_id}-v{version_of_handler}.nc?download=true
httpMethod: "get"
```
