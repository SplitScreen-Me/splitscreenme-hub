import React, { useEffect } from 'react';
import { withTracker } from 'meteor/react-meteor-data';
import { Row, Col, Typography } from 'antd';
import RegisterForm from './RegisterForm';
import { Session } from 'meteor/session';

const { Title, Paragraph, Text } = Typography;

function Register() {
  useEffect(() => {
    Session.set('loginModal', false);
  }, []);

  return (
    <Row>
      <Col span={8} offset={8}>
        <Typography>
          <Title>Create your account</Title>
          <Paragraph>Please, fill the form bellow.</Paragraph>
        </Typography>
        <RegisterForm />
      </Col>
    </Row>
  );
}
export default withTracker(() => {
  const loggedIn = Meteor.user();
  return {};
})(Register);
