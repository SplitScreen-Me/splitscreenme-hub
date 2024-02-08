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

// We store webview mode in local storage because sometimes people enter
// the website from a webview and then navigate to another page, then come back.

if(window.location.search.includes('fromWebview=false')){
  localStorage.setItem("fromWebview", "false");
}

if(window.location.search.includes('fromWebview=true') || localStorage.getItem("fromWebview") === "true"){
  console.log("This page is loaded from the Nucleus webview");
  localStorage.setItem("fromWebview", "true");
  isFromWebview.set(true);
}


NucleusWebview = {
  setLocalHandlerLibraryArray:  (handlerArray) => {
    Session.set('localHandlerLibraryArray', handlerArray);
  }
};

Meteor.startup(() => {
  render(<App />, document.getElementById('react-target'));
});
