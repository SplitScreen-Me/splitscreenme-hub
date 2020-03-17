import React from 'react';
import LoginForm from './LoginForm';
import { withTracker } from 'meteor/react-meteor-data';
import { Session } from 'meteor/session';
import { Row, Col, Typography, Modal, Spin, Result, Icon } from 'antd';
import { Redirect } from 'react-router';

const { Title, Paragraph, Text } = Typography;

function LoginModal(props) {
  const hideLogin = () => {
    Session.set('loginModal', false);
  };

  return (
    <Modal
      title={
        props.loggedIn ? "You've been logged in successfuly ✌" : 'Hey 👋 | Wanna join us ? ✌'
      }
      visible={props.isDisplayed}
      footer={null}
      onCancel={hideLogin}
    >
      {!props.loggedIn ? (
        <Spin spinning={props.loggingIn}>
          <LoginForm />
        </Spin>
      ) : (
        <Result
          icon={<Icon type="smile" theme="twoTone" />}
          title={`Glad to see you, ${props.loggedIn.profile.name ||
            props.loggedIn.profile.username} !`}
        />
      )}
    </Modal>
  );
}
export default withTracker(() => {
  const loggedIn = Meteor.user();
  const isDisplayed = Session.get('loginModal');
  const loggingIn = Meteor.loggingIn();
  return { loggedIn, isDisplayed, loggingIn };
})(LoginModal);
