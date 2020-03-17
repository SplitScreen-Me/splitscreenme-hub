import React from 'react';
import Menu from 'antd/lib/menu';
import { Link } from 'react-router-dom';
import Icon from 'antd/lib/icon';
import { withTracker } from 'meteor/react-meteor-data';
import { withRouter } from 'react-router';
import { Session } from 'meteor/session';
import { Tag } from 'antd';

function AppMenu(props) {
  const logout = () => {
    Meteor.logout();
  };
  const signIn = () => {
    Session.set('loginModal', true);
  };
  return (
    <Menu
      theme="dark"
      mode="horizontal"
      defaultSelectedKeys={[props.history.location.pathname]}
      selectedKeys={[props.history.location.pathname]}
      style={{ lineHeight: '64px' }}
    >
      <Menu.Item key="/splitscreenme">
        SplitScreen.Me
        <a href="https://www.splitscreen.me" />
      </Menu.Item>
      <Menu.Item key="/">
        Explore
        <Link to="/" />
      </Menu.Item>
      <Menu.Item key="/my-handlers">
        Create
        <Link to="/my-handlers" />
      </Menu.Item>
      <Menu.Item key="/yolo">
        FAQ
        <Link to="/yolo" />
      </Menu.Item>
      {props.loggedIn ? (
        <Menu.SubMenu
          style={{ float: 'right' }}
          title={
            <span>
              <Icon type="setting" />
              {props.loggedIn.profile.username}
            </span>
          }
        >
          <Menu.Item key="/settings">
            Settings
            <Link to="/settings" />
          </Menu.Item>
          <Menu.Item onClick={logout} key="/logout">
            Log out
            <Link to="/logout" />
          </Menu.Item>
        </Menu.SubMenu>
      ) : (
        <Menu.Item onClick={signIn} key="/login" style={{ float: 'right' }}>
          <span>
            <Icon type="login" />
            Sign in | Register
          </span>
        </Menu.Item>
      )}
    </Menu>
  );
}

export default withTracker(() => {
  const loggedIn = Meteor.user();
  return { loggedIn };
})(withRouter(AppMenu));
