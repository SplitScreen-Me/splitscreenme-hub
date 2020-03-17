import React from 'react';
import { Form, Icon, Input, Button, notification } from 'antd';
import { Link } from 'react-router-dom';
const FormItem = Form.Item;
class ForgotPasswordForm extends React.Component {
  handleSubmit = e => {
    e.preventDefault();
    this.props.form.validateFields((err, values) => {
      if (err) return notification.error(err);
      Meteor.call('accounts/sendResetEmail', values.email, passwordError => {
        if (passwordError) return notification.error(passwordError);
        notification.success(
          'If you have an account, an email will be sent to reset your password.',
        );
      });
    });
  };
  render() {
    const { getFieldDecorator } = this.props.form;
    return (
      <Form onSubmit={this.handleSubmit} className="login-form">
        <FormItem>
          {getFieldDecorator('email', {
            rules: [{ required: true, message: 'Please enter your email' }],
          })(<Input prefix={<Icon type="copy" style={{ fontSize: 13 }} />} placeholder="Email" />)}
        </FormItem>
        <FormItem>
          <Button type="primary" htmlType="submit" style={{ width: '100%' }}>
            Send reset email
          </Button>
        </FormItem>
      </Form>
    );
  }
}

export default Form.create()(ForgotPasswordForm);
