import React from 'react';
import { Layout, Form, Icon, Input, Button, Checkbox, notification, Collapse } from 'antd';
import { Link } from 'react-router-dom';
import OAuthLoginButtons from './OAuthLoginButtons/OAuthLoginButtons';
const FormItem = Form.Item;
const { Content } = Layout;
const { Panel } = Collapse;
class LoginForm extends React.Component {
  constructor() {
    super();
    this.state = {
      submitLoading: false,
    };
  }
  handleSubmit = e => {
    this.setState({
      submitLoading: true,
    });
    e.preventDefault();
    this.props.form.validateFields((err, values) => {
      if (err) {
        this.setState({
          submitLoading: false,
        });
      }
      Meteor.loginWithPassword({email: values.email}, values.password, loginError => {
        this.setState({
          submitLoading: false,
        });
        if (loginError) notification.error(loginError);
      });
    });
  };
  render() {
    const { getFieldDecorator } = this.props.form;
    return (
      <div>
        <OAuthLoginButtons
          services={['facebook', 'google', 'github', 'discord']}
          emailMessage={{
            offset: 100,
            text: ' ',
          }}
        />
        <Collapse bordered={false}>
          <Panel
            style={{ borderBottom: 'unset' }}
            header="Or use your email to login / register"
            key="1"
          >
            <span>Provide your credentials</span>
            <Form onSubmit={this.handleSubmit} className="login-form">
              <FormItem>
                {getFieldDecorator('email', {
                  rules: [{ required: true, message: 'Please enter your email' }],
                })(
                  <Input
                    prefix={<Icon type="copy" style={{ fontSize: 13 }} />}
                    placeholder="Email"
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
                {getFieldDecorator('remember', {
                  valuePropName: 'checked',
                  initialValue: true,
                })(<Checkbox>Remember me</Checkbox>)}
                <Link style={{ float: 'right' }} to="/forgot-password">
                  Forgot password
                </Link>
                <Button
                  loading={this.state.submitLoading}
                  type="primary"
                  htmlType="submit"
                  style={{ width: '100%' }}
                >
                  Log in
                </Button>
                Or <Link to="/register">register now using your email</Link>
              </FormItem>
            </Form>
          </Panel>
        </Collapse>
      </div>
    );
  }
}

export default Form.create()(LoginForm);
