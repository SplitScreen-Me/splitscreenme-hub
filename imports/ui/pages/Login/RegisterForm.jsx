import React from 'react';
import { Meteor } from 'meteor/meteor';
import { Session } from 'meteor/session';
import { Form, Icon, Input, Button, Checkbox, notification } from 'antd';
import { Accounts } from 'meteor/accounts-base';
import { withRouter } from 'react-router';
import { Link } from 'react-router-dom';
const FormItem = Form.Item;
class Register extends React.Component {
  constructor() {
    super();
    this.state = {
      submitLoading: false,
    };
  }
  handleSubmit = e => {
    e.preventDefault();
    this.setState({
      submitLoading: true,
    });

    const { history } = this.props;
    this.props.form.validateFields((err, values) => {
      if (err) {
        this.setState({
          submitLoading: false,
        });
      }
      Accounts.createUser(
        {
          email: values.email,
          password: values.password,
          profile: {
            username: values.username,
          },
        },
        error => {
          if (error) {
            notification.error(error);
            this.setState({
              submitLoading: false,
            });
          } else {
            //Meteor.call('users.sendVerificationEmail');
            notification.success({
              message: 'Welcome !',
              description:
                'You are now registered. Check your emails and enable your account in order to enable handlers publishing.',
            });
            history.push('/');
            this.setState({
              submitLoading: false,
            });
          }
        },
      );
    });
  };

  render() {
    const { getFieldDecorator } = this.props.form;
    return (
      <Form onSubmit={this.handleSubmit} className="login-form">
        <FormItem>
          {getFieldDecorator('email', {
            rules: [
              { required: true, message: 'Please enter your email' },
              { type: 'email', message: 'Please enter a valid email' },
            ],
          })(<Input prefix={<Icon type="copy" style={{ fontSize: 13 }} />} placeholder="Email" />)}
        </FormItem>
        <FormItem>
          {getFieldDecorator('username', {
            rules: [{ required: true, message: 'Please enter an username' }],
          })(
            <Input
              prefix={<Icon type="copy" style={{ fontSize: 13 }} />}
              placeholder="Desired username"
            />,
          )}
        </FormItem>
        <FormItem>
          {getFieldDecorator('password', {
            rules: [{ required: true, message: 'Please enter your password' }],
          })(
            <Input
              prefix={<Icon type="lock" style={{ fontSize: 13 }} />}
              type="password"
              placeholder="Password"
            />,
          )}
        </FormItem>
        <FormItem>
          A verification link will be sent to your email.
          <Button
            loading={this.state.submitLoading}
            type="primary"
            htmlType="submit"
            style={{ width: '100%' }}
          >
            Register
          </Button>
          Or{' '}
          <Link
            onClick={() => {
              Session.set('loginModal', true);
            }}
            to="#"
          >
            login now!
          </Link>
        </FormItem>
      </Form>
    );
  }
}

export default Form.create()(withRouter(Register));
