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
        SplitScreen.Me
        <a href="https://www.splitscreen.me" />
      </Menu.Item>
      <Menu.Item key="/">
        Explore
        <Link to="/" />
      </Menu.Item>
      <Menu.Item key="/my-handlers">
        My Handlers
        <Link to="/my-handlers" />
      </Menu.Item>
      <Menu.Item key="/docs">
        Docs
        <a href="https://www.splitscreen.me/docs/create-handlers" />
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
            Settings
            <Link to="/settings" />
          </Menu.Item>
          <Menu.Item key={`/user/${props.loggedIn._id}`}>
            Public profile
            <Link to={`/user/${props.loggedIn._id}`} />
          </Menu.Item>
          {!!isAdmin && <Menu.Item onClick={turnAdmin} key={`adminmodeonoff`}>
            Turn {!!isAdminEnabled ? 'off' : 'on'} admin mode
          </Menu.Item> }
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
      <Menu.Item key="/user" style={{ float: 'right' }}>
            Contributors
        <Link to={`/user`} />
      </Menu.Item>
    </Menu>
  );
}

export default withTracker(() => {
  const loggedIn = Meteor.user();
  return { loggedIn };
})(withRouter(AppMenu));
