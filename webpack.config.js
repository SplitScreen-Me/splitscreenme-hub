const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const meteorExternals = require('webpack-meteor-externals');
const AntDesignThemePlugin = require('antd-theme-webpack-plugin');
const path = require('path');
const options = {
  stylesDir: path.join(__dirname, './styles'),
  antDir: path.join(__dirname, './node_modules/antd'),
  varFile: path.join(__dirname, './styles/variables.less'),
  mainLessFile: path.join(__dirname, './styles/index.less'),
  themeVariables: [],
  indexFileName: 'index.html',
};

const clientConfig = {
  entry: './client/main.jsx',
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: ['babel-loader'],
      },
      {
        test: /\.less$/,
        use: [
          {
            loader: 'style-loader', // creates style nodes from JS strings
          },
          {
            loader: 'css-loader', // translates CSS into CommonJS
          },
          {
            loader: 'less-loader', // compiles Less to CSS
            options: {
              javascriptEnabled: true,
            },
          },
        ],
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.(png|svg|jpg|gif)$/,
        use: ['file-loader'],
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './client/main.html',
    }),
    new AntDesignThemePlugin(options),
    new webpack.HotModuleReplacementPlugin(),
  ],
  resolve: {
    extensions: ['*', '.js', '.jsx', '.json'],
    alias: {
      'react-dom': '@hot-loader/react-dom',
    },
  },
  externals: [meteorExternals()],
  devServer: {
    hot: true,
  },
};

const serverConfig = {
  entry: ['./server/main.js'],
  target: 'node',
  resolve: {
    extensions: ['*', '.js', '.jsx', '.json'],
    alias: {
      'handlebars': 'handlebars/dist/handlebars.min.js',
    },
  },
  devServer: {
    hot: true,
  },
  externals: [meteorExternals()],
};

module.exports = [clientConfig, serverConfig];
