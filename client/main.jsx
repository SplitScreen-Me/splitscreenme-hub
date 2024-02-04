import React from 'react';
import { Meteor } from 'meteor/meteor';
import { render } from 'react-dom';
import { Session } from 'meteor/session';
import isFromWebview  from '../imports/ui/helpers/isFromWebview';
import App from '../imports/ui/layouts/App';

Accounts.onLogin(function() {
  setTimeout(() => {
    Session.set('loginModal', false);
  }, 3000);
});

if(window.location.search.includes('fromWebview')){
  console.log("This page is loaded from the Nucleus webview");
  isFromWebview.set(true);
}
NucleusWebview = {
  setLocalHandlerLibraryIds:  (ids) => {
    Session.set('localHandlerLibraryIds', ids);
  }
};

Meteor.startup(() => {
  render(<App />, document.getElementById('react-target'));
});
