import { hot } from 'react-hot-loader/root';
import React, { useState } from 'react';

import Layout from 'antd/lib/layout';
import Menu from 'antd/lib/menu';
import { Alert, Spin, notification } from 'antd';
import { Session } from 'meteor/session';
import Home from '../pages/Home/Home';
import { BrowserRouter as Router, Route, Link, Switch } from 'react-router-dom';
import Icon from 'antd/lib/icon';
import Handlers from '../pages/Handlers/Handlers';
import Login from '../pages/Login/Login';
import Register from '../pages/Login/Register';
import MyHandlers from '../pages/MyHandlers/MyHandlers';
import { withTracker } from 'meteor/react-meteor-data';
import { Redirect } from 'react-router';
import AppMenu from './App/AppMenu';
import ForgotPassword from '../pages/Login/ForgotPassword';
import ResetPassword from '../pages/Login/ResetPassword';
import Settings from '../pages/Profile/Settings';
import Handler from '../pages/Handlers/Handler';
import CreateHandler from '../pages/MyHandlers/CreateHandler';
import VerifyEmail from '../pages/VerifyEmail/VerifyEmail';
import NotFound from '../pages/Common/NotFound';
import LoginModal from '../pages/Login/LoginModal';
import UserHandlers from "../pages/Users/UserHandlers";

const { Header, Footer, Sider, Content } = Layout;
Session.setDefault('loginModal', false);

function App(props) {
  const [sendingMail, setSendingMail] = useState(false);

  const handleResendVerificationEmail = emailAddress => {
    setSendingMail(true);
    Meteor.call('users.sendVerificationEmail', error => {
      try {
        setSendingMail(false);
      } catch (e) {
        console.log(e);
      }
      if (error) {
        notification.error({ message: 'Email verification', description: error.reason });
      } else {
        notification.success({
          message: 'Email verification',
          description: `Check ${emailAddress} for a verification link!`,
        });
      }
    });
  };
  return (
    <Router>
      <div>
        <Layout className="layout">
          <Header className="header">
            <AppMenu />
          </Header>
          <Content className="content">
            {props.loggedIn &&
              props.loggedIn.emails &&
              props.loggedIn.emails[0] &&
              !props.loggedIn.emails[0].verified && (
                <Spin spinning={sendingMail}>
                  <Alert
                    message="Please, verify your email"
                    description={
                      <div>
                        You're logged in, but your email require verification before you can upload
                        your own handlers.{' '}
                        <a
                          onClick={() =>
                            handleResendVerificationEmail(props.loggedIn.emails[0].address)
                          }
                          href="#"
                        >
                          Re-send verification email
                        </a>
                      </div>
                    }
                    type="warning"
                    showIcon
                  />
                </Spin>
              )}
            <div className="inner-content">
              <Switch>
                <Route path="/" exact component={Handlers} />
                <Route path="/my-handlers" exact component={MyHandlers} />
                <Route path="/create-handler" exact component={CreateHandler} />
                <Route path="/settings" exact component={Settings} />
                <Route path="/login" exact component={Login} />
                <Route path="/register" exact component={Register} />
                <Route path="/forgot-password" exact component={ForgotPassword} />
                <Route path="/reset-password" exact component={ResetPassword} />
                <Route path="/verify-email/:token" exact component={VerifyEmail} />
                <Route path="/handler/:id" exact component={Handler} />
                <Route path="/user/:id" exact component={UserHandlers} />
                <Route path="/user" exact component={UserHandlers} />
                <Route exact path="/logout" render={() => <Redirect to="/" />} />
                <Route component={NotFound} />
              </Switch>
            </div>
          </Content>
          <Footer className="footer">
            SplitScreen.Me ©2019. Created by <a href="https://github.com/r-mach">r-mach</a>
          </Footer>
        </Layout>
      </div>
      <LoginModal />
    </Router>
  );
}

export default hot(
  withTracker(() => {
    const loggedIn = Meteor.user();
    return { loggedIn };
  })(App),
);
