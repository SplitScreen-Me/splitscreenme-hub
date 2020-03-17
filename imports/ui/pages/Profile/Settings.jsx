import React from 'react';
import { Form, Input, Button, Row, Col, Icon, notification } from 'antd';
import styled from 'styled-components';
import { Accounts } from 'meteor/accounts-base';
import { withTracker } from 'meteor/react-meteor-data';
import _ from 'lodash';
import { Meteor } from 'meteor/meteor';
import getUserProfile from '../../../modules/get-user-profile';
const FormItem = Form.Item;

const StyledProfile = styled.div`
  .nav.nav-tabs {
    margin-bottom: 20px;
  }

  .LoggedInWith {
    padding: 20px;
    border-radius: 3px;
    color: #fff;
    border: 1px solid #eee;
    text-align: center;

    img {
      width: 100px;
    }

    &.github img {
      width: 125px;
    }

    p {
      margin: 20px 0 0 0;
      color: #777;
    }

    .btn {
      margin-top: 20px;

      &.btn-facebook {
        background: #3b5998;
        border-color: #3b5998;
        color: #fff;
      }

      &.btn-google {
        background: #ea4335;
        border-color: #ea4335;
        color: #fff;
      }

      &.btn-github {
        background: #333;
        border-color: #333;
        color: #fff;
      }
      &.btn-discord {
        background: #7289da;
        border-color: #7289da;
        color: #fff;
      }
    }
  }

  .btn-export {
    padding: 0;
  }
`;

class Settings extends React.Component {
  handleSubmit(e) {
    e.preventDefault();
    this.props.form.validateFields((err, values) => {
      if (!err) {
        Accounts.changePassword(values.oldPassword, values.newPassword, error => {
          if (error) return notification.error(error);
          notification.success({
            message: 'Password updated',
          });
        });
      }
    });
  }
  getUserType(user) {
    return user.service === 'password' ? 'password' : 'oauth';
  }
  renderOAuthUser(loading, user) {
    return !loading ? (
      <div className="OAuthProfile">
        <div key={user.service} className={`LoggedInWith ${user.service}`}>
          <img src={`/${user.service}.svg`} alt={user.service} />
          <p>{`You're logged in with ${_.capitalize(user.service)} using the email address ${
            user.emails[0].address
          }.`}</p>
          <Button
            className={`btn btn-${user.service}`}
            href={
              {
                facebook: 'https://www.facebook.com/settings',
                google: 'https://myaccount.google.com/privacy#personalinfo',
                github: 'https://github.com/settings/profile',
                discord: 'https://discordapp.com/channels/@me',
              }[user.service]
            }
            target="_blank"
          >
            Edit Profile on {_.capitalize(user.service)}
          </Button>
        </div>
      </div>
    ) : (
      <div />
    );
  }

  renderPasswordUser = (loading, user) => {
    return !loading ? (
      <Form onSubmit={this.handleSubmit.bind(this)} className="login-form">
        <FormItem>
          {this.props.form.getFieldDecorator('oldPassword', {
            rules: [{ required: true, message: 'Please enter your old password' }],
          })(
            <Input
              prefix={<Icon type="lock" style={{ fontSize: 13 }} />}
              type="password"
              placeholder="Old Password"
            />,
          )}
        </FormItem>
        <FormItem>
          {this.props.form.getFieldDecorator('newPassword', {
            rules: [{ required: true, message: 'Please enter your new password' }],
          })(
            <Input
              prefix={<Icon type="lock" style={{ fontSize: 13 }} />}
              type="password"
              placeholder="New Password"
            />,
          )}
        </FormItem>
        <FormItem>
          <Button type="primary" htmlType="submit" className="login-form-button">
            Update password
          </Button>
        </FormItem>
      </Form>
    ) : (
      <div />
    );
  };

  renderProfileForm(loading, user) {
    return !loading ? (
      {
        password: this.renderPasswordUser,
        oauth: this.renderOAuthUser,
      }[this.getUserType(user)](loading, user)
    ) : (
      <div />
    );
  }

  render() {
    const user = this.props.user;
    return (
      <Row>
        <Col sm={12}>
          <StyledProfile>
            <h4 className="page-header">
              {user && user.profile && user.profile.name && user.profile.name.first
                ? `${user.profile.name.first} ${user.profile.name.last}`
                : user.username}
            </h4>
            <div>{this.renderProfileForm(this.props.loading, user)}</div>
          </StyledProfile>
        </Col>
      </Row>
    );
  }
}

export default withTracker(() => {
  const subscription = Meteor.subscribe('users.editProfile');

  return {
    loading: !subscription.ready(),
    user: getUserProfile(Meteor.users.findOne({ _id: Meteor.userId() })),
  };
})(Form.create()(Settings));
