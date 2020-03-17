import React from 'react';
import LoginForm from './LoginForm';
import { withTracker } from 'meteor/react-meteor-data';
import { Row, Col, Typography } from 'antd';
import { Redirect } from 'react-router';

const { Title, Paragraph, Text } = Typography;

function Login(props) {
  return (
    <Row>
      <Col span={8} offset={8}>
        {props.loggedIn && <Redirect to="/" />}
        <Typography>
          <Title>Log in the hub !</Title>
          <Paragraph>Please, provide your credentials.</Paragraph>
        </Typography>
        <LoginForm />
      </Col>
    </Row>
  );
}
export default withTracker(() => {
  const loggedIn = Meteor.user();
  return { loggedIn };
})(Login);
