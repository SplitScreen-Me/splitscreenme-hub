import React, { useState } from 'react';
import {
  PageHeader,
  Form,
  Input,
  List,
  Tooltip,
  Avatar,
  Spin,
  Icon,
  Modal,
  notification, Checkbox
} from "antd";
import { Result, Button } from 'antd';
import { withTracker } from 'meteor/react-meteor-data';
import { Link } from 'react-router-dom';
import { withRouter } from 'react-router';
import { Session } from 'meteor/session';

const gameSearch = new ReactiveVar([]);

const formItemLayout = {
  labelCol: { span: 4 },
  wrapperCol: { span: 8 },
};
const formTailLayout = {
  labelCol: { span: 4 },
  wrapperCol: { span: 8, offset: 4 },
};

function CreateHandler(props) {
  const [isLoading, setIsLoading] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedGame, setSelectedGame] = useState({});
  const { getFieldDecorator } = props.form;
  const check = () => {
    props.form.validateFields((err, values) => {
      console.log(values)
      if (!err) {
        setIsLoading(true);
        Meteor.call('handlers.seekGame', values.gameName, values.searchFilter, (error, result) => {
          console.log(result);
          gameSearch.set(result);
          setIsLoading(false);
        });
      }
    });
  };
  const createModalForId = index => {
    console.log(index);
    setSelectedGame(gameSearch.get()[index]);
    setModalVisible(true);
  };

  const handleOk = () => {
    setCreateLoading(true);
    props.form.validateFields((err, values) => {
      if (!err) {
        const newHandler = {
          title: values.handlerName,
          gameName: selectedGame.name,
          gameDescription: selectedGame.summary,
          gameCover:
            selectedGame.cover && selectedGame.cover.image_id
              ? selectedGame.cover.image_id
              : 'no_cover',
          gameId: selectedGame.id,
          gameUrl: selectedGame.url,
        };
        Meteor.call('handlers.insert', newHandler, (error, result) => {
          if (error) {
            console.log(result);
            notification.error(error);
            setCreateLoading(false);
          } else {
            console.log(result);
            props.history.push(`/handler/${result}`);
          }
        });
      } else {
        notification.error('Please, complete the form correctly.');
        setCreateLoading(false);
      }
    });
  };

  const handleCancel = () => {
    setModalVisible(false);
  };

  return (
    <div>
      {props.loggedIn ? (
        <PageHeader
          title="Create a new handler"
          onBack={() => window.history.back()}
          subTitle="Complete the form in order to create your handler"
        >
          <div className="content">
            <div className="main">
              <Form.Item {...formItemLayout} label="Game name">
                {getFieldDecorator('gameName', {
                  rules: [
                    {
                      required: true,
                      message: 'Please input a game name.',
                    },
                  ],
                })(<Input placeholder="What game will you create a handler for ?" />)}
              </Form.Item>
              <Form.Item {...formItemLayout} label="Filter PC platform only">
                {getFieldDecorator('searchFilter')(<Checkbox  name="searchFilter" valuePropName="checked" defaultChecked />)}
              </Form.Item>
              <Form.Item {...formTailLayout}>
                <Button type="primary" onClick={check}>
                  Search games
                </Button>
              </Form.Item>
            </div>
            <div>
              <Spin spinning={isLoading}>
                <List
                  itemLayout="vertical"
                  size="large"
                  pagination={{
                    onChange: page => {
                      console.log(page);
                    },
                    pageSize: 50,
                  }}
                  dataSource={props.rvGameSearch}
                  footer={
                    <div>
                      <b>SplitScreen.Me</b> compatible games.
                    </div>
                  }
                  renderItem={(item, index) => (
                    <List.Item
                      key={item.name}
                      extra={
                        <Button
                          onClick={() => {
                            createModalForId(index);
                          }}
                          style={{ marginTop: '45px' }}
                          key="1"
                          type="primary"
                        >
                          <Icon type="check" /> Select this game
                        </Button>
                      }
                    >
                      <List.Item.Meta
                        avatar={
                          <img
                            width={90}
                            alt="logo"
                            src={
                              item.cover && item.cover.image_id
                                ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${item.cover.image_id}.jpg`
                                : 'https://gw.alipayobjects.com/zos/rmsportal/mqaQswcyDLcXyDKnZfES.png'
                            }
                          />
                        }
                        title={item.name}
                        description={item.summary}
                      />
                    </List.Item>
                  )}
                />
                <Modal
                  title="Create your handler"
                  visible={modalVisible}
                  onOk={handleOk}
                  onCancel={handleCancel}
                  footer={[
                    <Button key="back" onClick={handleCancel}>
                      Cancel
                    </Button>,
                    <Button key="submit" type="primary" loading={createLoading} onClick={handleOk}>
                      Create
                    </Button>,
                  ]}
                >
                  <p>Game name : {selectedGame.name ? selectedGame.name : 'Unnamed game'}</p>
                  <Form.Item label="Handler name">
                    {getFieldDecorator('handlerName', {
                      rules: [
                        {
                          message: 'Please input a handler name.',
                        },
                      ],
                    })(<Input placeholder="Give a name to your handler" />)}
                  </Form.Item>
                </Modal>
              </Spin>
            </div>
          </div>
        </PageHeader>
      ) : (
        <Result
          status="500"
          title="Not logged in!"
          subTitle="To create and manage your handlers, you must have an account and be logged in."
          extra={
            <Link
              onClick={() => {
                Session.set('loginModal', true);
              }}
              to="#"
            >
              <Button type="primary">Log in or create an account</Button>
            </Link>
          }
        />
      )}
    </div>
  );
}
export default withTracker(() => {
  const loggedIn = Meteor.user();
  return {
    rvGameSearch: gameSearch.get(),
    loggedIn,
  };
})(Form.create()(withRouter(CreateHandler)));
