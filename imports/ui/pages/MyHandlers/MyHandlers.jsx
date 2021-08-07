import React, { useState } from 'react';
import {List, Avatar, Icon, Tabs, PageHeader, Alert, Typography, Tooltip} from 'antd';
import { Result, Button } from 'antd';
import { withTracker } from 'meteor/react-meteor-data';
import HandlersCollection from '../../../api/Handlers/Handlers';
import { Link } from 'react-router-dom';
import Moment from 'react-moment';
import counterFormatter from '../../../modules/counterFormatter';
import { Session } from 'meteor/session';
const { Text } = Typography;
const { TabPane } = Tabs;
const IconText = ({ type, text }) => (
  <span>
    <Icon type={type} style={{ marginRight: 8 }} />
    {text}
  </span>
);

function MyHandlers(props) {
  return (
    <div>
      {props.loggedIn ? (
        <PageHeader
          title="Your handlers"
          subTitle="Manage your handlers or create new one"
          extra={[
            <Link key="1" to="/create-handler">
              <Button
                disabled={
                  props.loggedIn &&
                  props.loggedIn.emails &&
                  props.loggedIn.emails[0] &&
                  !props.loggedIn.emails[0].verified
                }
                type="primary"
              >
                <Icon type="plus-circle" /> Create new handler
              </Button>
            </Link>,
          ]}
        >
          <div className="content">
            <div className="main">
              <List
                itemLayout="vertical"
                size="large"
                pagination={{
                  onChange: page => {},
                  pageSize: 10,
                }}
                dataSource={props.handlers}
                footer={
                  <div>
                    <b>SplitScreen.Me</b> compatible handlers.
                  </div>
                }
                renderItem={item => (
                  <List.Item
                    key={item._id}
                    actions={[
                      item.downloadCount > 999 ? (
                          <Tooltip placement="bottomLeft" title={item.downloadCount} arrowPointAtCenter>
                            <Link to={`/handler/${item._id}`}>
                              <IconText type="fire" text={counterFormatter(item.stars)} key="list-vertical-star-o" />
                            </Link>
                          </Tooltip>
                      ) : (
                          <Link to={`/handler/${item._id}`}>
                            <IconText type="fire" text={counterFormatter(item.stars)} key="list-vertical-star-o" />
                          </Link>
                      ),
                      item.downloadCount > 999 ? (
                          <Tooltip placement="bottomLeft" title={item.downloadCount} arrowPointAtCenter>
                            <Link to={`/handler/${item._id}`}>
                              <IconText type="download" text={counterFormatter(item.downloadCount)} key="list-vertical-download" />
                            </Link>
                          </Tooltip>
                      ) : (
                          <Link to={`/handler/${item._id}`}>
                            <IconText type="download" text={counterFormatter(item.downloadCount)} key="list-vertical-download" />
                          </Link>
                      ),
                      item.downloadCount > 999 ? (
                          <Tooltip placement="bottomLeft" title={item.commentCount} arrowPointAtCenter>
                            <Link to={`/handler/${item._id}`}>
                              <IconText type="message" text={counterFormatter(item.commentCount)} key="list-vertical-message" />
                            </Link>
                          </Tooltip>
                      ) : (
                          <Link to={`/handler/${item._id}`}>
                            <IconText type="message" text={counterFormatter(item.commentCount)} key="list-vertical-message" />
                          </Link>
                      ),
                    ]}
                    extra={
                      <img
                        height={180}
                        alt="logo"
                        src={
                          item.gameCover !== 'no_cover'
                            ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${item.gameCover}.jpg`
                            : '/no_image.jpg'
                        }
                      />
                    }
                  >
                    <List.Item.Meta
                      title={
                        <div>
                          <Link to={`/handler/${item._id}`}>{item.title}</Link>{' '}
                          <Text type="secondary" style={{ fontSize: '12px', marginLeft: '15px' }}>
                            {item.gameName}
                          </Text>
                        </div>
                      }
                      description={
                        <span>
                          Last update <Moment format="YYYY-MM-DD HH:mm">{item.updatedAt}</Moment>
                        </span>
                      }
                    />
                    <Link to={`/handler/${item._id}`}>
                      <Button type="primary">View & Edit</Button>
                    </Link>
                  </List.Item>
                )}
              />
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
  const subscription = Meteor.subscribe('handlers.mine');
  const loggedIn = Meteor.user();
  const userId = loggedIn ? loggedIn._id : '';
  return {
    loading: !subscription.ready(),
    loggedIn,
    handlers: HandlersCollection.find(
      { owner: userId },
      {
        sort: { createdAt: -1 },
      },
    ).fetch(),
  };
})(MyHandlers);
