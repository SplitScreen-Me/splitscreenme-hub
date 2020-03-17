import React from 'react';
import { Meteor } from 'meteor/meteor';
import { render } from 'react-dom';
import { Session } from 'meteor/session';
import App from '../imports/ui/layouts/App';

Accounts.onLogin(function() {
  setTimeout(() => {
    Session.set('loginModal', false);
  }, 3000);
});

Meteor.startup(() => {
  render(<App />, document.getElementById('react-target'));
});
