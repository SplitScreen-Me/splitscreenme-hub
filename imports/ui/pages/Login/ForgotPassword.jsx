import React, { useEffect } from 'react';
import { withTracker } from 'meteor/react-meteor-data';
import { Row, Col, Typography } from 'antd';
import { Redirect } from 'react-router';
import ForgotPasswordForm from './ForgotPasswordForm';
import { Session } from 'meteor/session';

const { Title, Paragraph, Text } = Typography;

function ForgotPassword(props) {
  useEffect(() => {
    Session.set('loginModal', false);
  }, []);

  return (
    <Row>
      <Col span={8} offset={8}>
        {props.loggedIn && <Redirect to="/" />}
        <Typography>
          <Title>Reset password</Title>
          <Paragraph>
            Provide the mail associated with your account and we will send you a reset link.
          </Paragraph>
        </Typography>
        <ForgotPasswordForm />
      </Col>
    </Row>
  );
}
export default withTracker(() => {
  const loggedIn = Meteor.user();
  return { loggedIn };
})(ForgotPassword);
