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

  const turnAdmin = () => {
    Meteor.call('users.adminEnable', (result, err)=>{
      console.log("Administrator mode");
    })
  };
  const isAdmin = props.loggedIn && Roles.userIsInRole(props.loggedIn._id, ['admin']);
  const isAdminEnabled = props.loggedIn && Roles.userIsInRole(props.loggedIn._id, ['admin_enabled']);

  return (
    <Menu
      theme="dark"
      mode="horizontal"
      defaultSelectedKeys={[props.history.location.pathname]}
      selectedKeys={[props.history.location.pathname]}
      style={{ lineHeight: '64px', ...(!!isAdminEnabled && {backgroundColor:'#670000'})}}
    >
      <Menu.Item key="/splitscreenme">
        <a href="https://www.splitscreen.me">
          <Icon
            component={() => (
              <img src="../splitscreen-me-logo.png" height="35px" alt="SplitScreen Me logo" />
            )}
          />
          SplitScreen Me
        </a>
      </Menu.Item>
      <Menu.Item key="/">
        <Link to="/">Explore</Link>
      </Menu.Item>
      <Menu.Item key="/my-handlers">
        <Link to="/my-handlers">My Handlers</Link>
      </Menu.Item>
      <Menu.Item key="/docs">
        <a href="https://www.splitscreen.me/docs/create-handlers">Docs</a>
      </Menu.Item>

      {props.loggedIn ? (
        <Menu.SubMenu
          style={{ float: 'right' }}
          title={
            <span>
              <Icon type="setting" />
              {!!isAdminEnabled && "(admin) "}{props.loggedIn.profile.username}
            </span>
          }
        >
          <Menu.Item key="/settings">
            <Link to="/settings">Settings</Link>
          </Menu.Item>
          <Menu.Item key={`/user/${props.loggedIn._id}`}>
            <Link to={`/user/${props.loggedIn._id}`}>Public profile</Link>
          </Menu.Item>
          {!!isAdmin && <Menu.Item onClick={turnAdmin} key={`adminmodeonoff`}>
              Turn {!!isAdminEnabled ? 'off' : 'on'} admin mode
          </Menu.Item> }
          <Menu.Item onClick={logout} key="/logout">
            <Link to="/logout">Log out</Link>
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
      <Menu.Item key="/user" style={{ float: 'right' }}>
        <Link to={`/user`}>Contributors</Link>
      </Menu.Item>
    </Menu>
  );
}

export default withTracker(() => {
  const loggedIn = Meteor.user();
  return { loggedIn };
})(withRouter(AppMenu));
