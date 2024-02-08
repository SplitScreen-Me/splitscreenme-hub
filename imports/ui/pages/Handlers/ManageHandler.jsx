import React from 'react';
import { Accounts } from 'meteor/accounts-base';
import { Form, Icon, Input, Button, notification, Checkbox, Popconfirm, Divider, Radio } from "antd";
import { withRouter } from 'react-router';
const FormItem = Form.Item;
const { TextArea } = Input;

class ManageHandler extends React.Component {
  handleSubmit = e => {
    e.preventDefault();
    this.props.form.validateFields((err, values) => {
      if (err) return notification.error(err);
      Meteor.call(
        'handlers.update',
        {
          _id: this.props.handlerId,
          title: values.title,
          description: values.description,
          maxPlayers: parseInt(values.maxPlayers),
          playableControllers: !!values.playableControllers,
          playableMouseKeyboard: values.playableMouseKeyboardOption >= 1,
          playableMultiMouseKeyboard: values.playableMouseKeyboardOption === 2,
          private: !values.isPublic,
        },
        (error, result) => {
          if (error) return notification.error(error);
          else
            return notification.success({
              message: 'Handler updated',
              description: 'Your modifications had been saved.',
            });
        },
      );
    });
  };
  componentDidMount() {
    this.props.form.setFieldsValue({
      description: this.props.initialDescription,
      title: this.props.initialTitle,
      maxPlayers: this.props.maxPlayers,
    });
  }
  render() {
    const { getFieldDecorator } = this.props.form;
    return (
      <React.Fragment>
        <Form onSubmit={this.handleSubmit} className="login-form">
          <h4>Your handler name</h4>
          <FormItem>
            {getFieldDecorator('title', {
              rules: [{ required: true, message: 'Please enter a valid name for your handler.' }],
            })(<Input type="text" />)}
          </FormItem>
          <h4>Your handler description (Markdown supported)</h4>
          <FormItem>
            {getFieldDecorator('description', {
              rules: [
                { required: true, message: 'Please enter a valid description for your handler.' },
              ],
            })(
              <TextArea
                placeholder="Your handler description..."
                autosize={{ minRows: 5, maxRows: 25 }}
              />,
            )}
          </FormItem>
          <h4>Maximum number of players (2-64)</h4>
          <FormItem>
            {getFieldDecorator('maxPlayers', {
              rules: [{
                required: true,
                message: 'Please enter a valid maximum number of players compatible for this handler.',
              }],
            })(<Input max={64} min={2} type="number" />)}
          </FormItem>
          <h4>Controllers compatibility</h4>
          <FormItem>
            {getFieldDecorator('playableControllers', {
              valuePropName: 'checked',
              initialValue: this.props.playableControllers,
            })(
              <Checkbox>
                {' '}
                Controllers are compatible
              </Checkbox>,
            )}
          </FormItem>
          <h4>Mouse + Keyboard compatibility</h4>
          <FormItem>
            {getFieldDecorator('playableMouseKeyboardOption', {
              initialValue: this.props.playableMultiMouseKeyboard ? 2 : this.props.playableMouseKeyboard ? 1 : 0,
            })(
              <Radio.Group>
                <Radio value={0}>Not compatible</Radio>
                <Radio value={1}>Single</Radio>
                <Radio value={2}>Multiple</Radio>
              </Radio.Group>,
            )}
          </FormItem>
          <h4>Availability</h4>
          <FormItem>
            {getFieldDecorator('isPublic', {
              valuePropName: 'checked',
              initialValue: !this.props.handlerStatus,
            })(
              <Checkbox disabled={!this.props.handlerVersion}>
                {' '}
                I want to publicly share my handler.
              </Checkbox>,
            )}
          </FormItem>
          <FormItem>
            <Button type="primary" htmlType="submit">
              Save changes
            </Button>
          </FormItem>
        </Form>
        <Divider />
        <h4>Dangerous operations</h4>
        Removing a handler will permanently delete the associated packages, comments, and everything related to the handler.<br /><br />
        <Popconfirm
          title="Are you sure ?"
          onConfirm={() => {
            Meteor.call(
              'handlers.remove',
                this.props.handlerId,
              (error, result) => {
                if (error) {
                  return notification.error(error);
                }else{
                  this.props.history.push('/my-handlers');
                  return notification.success({
                    message: 'Handler removed',
                    description: 'The handler has been permanently removed.',
                  });
                }
              },
            );
          }}
          icon={<Icon type="question-circle-o" style={{ color: 'red' }} />}
        >
          <Button type="danger">Delete Handler</Button>
        </Popconfirm>

        </React.Fragment>
    );
  }
}

export default Form.create()(withRouter(ManageHandler));