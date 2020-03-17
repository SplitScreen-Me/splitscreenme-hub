import React from 'react';
import { withTracker } from 'meteor/react-meteor-data';
import { Row, Col } from 'antd';
import { Redirect } from 'react-router';
import ResetPasswordForm from './ResetPasswordForm';

function ResetPassword(props) {
  return (
    <Row>
      <Col span={8} offset={8}>
        {props.loggedIn && <Redirect to="/" />}
        <ResetPasswordForm />
      </Col>
    </Row>
  );
}
export default withTracker(() => {
  const loggedIn = Meteor.user();
  return { loggedIn };
})(ResetPassword);
