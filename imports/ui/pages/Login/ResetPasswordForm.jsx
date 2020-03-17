import React from 'react';
import { Accounts } from 'meteor/accounts-base';
import { Form, Icon, Input, Button, notification } from 'antd';
import { withRouter } from 'react-router';
const FormItem = Form.Item;
class ResetPasswordForm extends React.Component {
  handleSubmit = e => {
    e.preventDefault();
    this.props.form.validateFields((err, values) => {
      if (err) return notification.error(err);
      if (values.passwordOne === values.passwordTwo)
        Accounts.resetPassword('NeedToRetrieveToken', values.passwordOne, setPasswordError => {
          if (setPasswordError) notification.error(setPasswordError);
          else {
            notification.success({ message: 'Password Updated' });
          }
        });
      else notification.error({ message: 'Passwords do not match' });
    });
  };
  render() {
    const { getFieldDecorator } = this.props.form;
    return (
      <Form onSubmit={this.handleSubmit} className="login-form">
        <h4>Please enter your new password</h4>
        <FormItem>
          {getFieldDecorator('passwordOne', {
            rules: [{ required: true, message: 'Please enter your password' }],
          })(<Input type="password" prefix={<Icon type="lock" style={{ fontSize: 13 }} />} />)}
        </FormItem>
        <FormItem>
          {getFieldDecorator('passwordTwo', {
            rules: [{ required: true, message: 'Please repeat your password' }],
          })(<Input type="password" prefix={<Icon type="lock" style={{ fontSize: 13 }} />} />)}
        </FormItem>
        <FormItem>
          <Button type="primary" htmlType="submit" style={{ width: '100%' }}>
            Reset password
          </Button>
        </FormItem>
      </Form>
    );
  }
}

export default Form.create()(withRouter(ResetPasswordForm));
