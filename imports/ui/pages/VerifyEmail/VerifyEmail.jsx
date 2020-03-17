import React from 'react';
import { Meteor } from 'meteor/meteor';
import { Icon, Input, Button, Alert, notification } from 'antd';
import { Accounts } from 'meteor/accounts-base';
import { withRouter } from 'react-router';

class VerifyEmail extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  componentDidMount() {
    const { match, history } = this.props;
    Accounts.verifyEmail(match.params.token, error => {
      if (error) {
        notification.error({ message: 'Error during verification', description: error.reason });
        this.setState({ error: `${error.reason}. Please try again.` });
      } else {
        setTimeout(() => {
          notification.success({ message: 'Verified', description: "It's all set ! Thanks." });
          Meteor.call('users.sendWelcomeEmail', errorMethod => {
            if (errorMethod) {
              notification.error({
                message: 'Error in sending welcome email',
                description: errorMethod.reason,
              });
            } else {
              history.push('/');
            }
          });
        }, 1500);
      }
    });
  }

  render() {
    return (
      <div className="VerifyEmail">
        <Alert
          message="Email verification"
          description={!this.state.error ? 'Verifying...' : this.state.error}
          type={!this.state.error ? 'info' : 'error'}
          showIcon
        />
      </div>
    );
  }
}

export default withRouter(VerifyEmail);
