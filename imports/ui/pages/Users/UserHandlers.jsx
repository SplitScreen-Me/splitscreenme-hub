import React, { useState } from 'react';
import { List, Avatar, Icon, Tabs, PageHeader, Alert, Typography, Divider, Descriptions, Card } from "antd";
import { Result, Button } from 'antd';
import { withTracker } from 'meteor/react-meteor-data';
import HandlersCollection from '../../../api/Handlers/Handlers';
import { Link } from 'react-router-dom';
import Moment from 'react-moment';
import counterFormatter from '../../../modules/counterFormatter';
import { Session } from 'meteor/session';
import { withRouter } from "react-router";
const { Text } = Typography;
const { TabPane } = Tabs;
const IconText = ({ type, text, ...rest }) => (
  <span {...rest}>
    <Icon type={type} style={{ marginRight: 8 }} />
    {text}
  </span>
);
const { Meta } = Card;
function UserHandlers(props) {
  return (
    <div>
        <PageHeader
          title={`${props.userProfile.profile.username}`}
          subTitle="'s public profile"
        >
          <div className="content">
            <div className="main">
              <Descriptions title="Stats & informations">
                <Descriptions.Item label="Published handlers count">{props.handlers.length}</Descriptions.Item>
                <Descriptions.Item label="Published handlers hotness">{props.handlers.reduce((total, current) => total + current.stars, 0)}</Descriptions.Item>
                <Descriptions.Item label="Published handlers downloads">{props.handlers.reduce((total, current) => total + current.downloadCount, 0)}</Descriptions.Item>
              </Descriptions>
              <Divider />
              <Descriptions title="Contributions" />
              <List
                size="small"
                pagination={{
                  onChange: page => {},
                  pageSize: 5,
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

                    ]}
                    extra={
                      <Link to={`/handler/${item._id}`}>
                        <Button type="primary">View handler</Button>
                      </Link>
                    }
                  >
                    <List.Item.Meta
                      title={
                        <div>
                          <img
                            height={130}
                            style={{float:'left'}}
                            alt="logo"
                            src={
                              item.gameCover !== 'no_cover'
                                ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${item.gameCover}.jpg`
                                : '/no_image.jpg'
                            }
                          />
                          <div style={{marginLeft:'145px'}}>
                          <Link to={`/handler/${item._id}`}>{item.title}</Link>{' '}<br />
                          <Text type="secondary" style={{ fontSize: '12px' }}>
                            {item.gameName}
                          </Text><br />
                          <span>
                          Last update <Moment format="YYYY-MM-DD HH:mm">{item.updatedAt}</Moment>
                        </span><br /><br />
                            <IconText
                              type="fire"
                              text={counterFormatter(item.stars)}
                              key="list-vertical-star-o"
                            />
                            <IconText
                              type="download"
                              text={counterFormatter(item.downloadCount)}
                              key="list-vertical-download"
                              style={{marginLeft:'25px'}}

                            />
                            <IconText
                              type="message"
                              text={counterFormatter(item.commentCount)}
                              key="list-vertical-message"
                              style={{marginLeft:'25px'}}
                            />
                          </div>
                        </div>
                      }
                    />

                  </List.Item>
                )}
              />
            </div>
          </div>
        </PageHeader>
    </div>
  );
}
export default withRouter(withTracker((props) => {
  const subscription = Meteor.subscribe('handlers.user', props.match.params.id);
  const subscriptionUser = Meteor.subscribe('users.getProfile', props.match.params.id);
  const user = Meteor.user();
  return {
    loading: !subscription.ready() || !subscriptionUser.ready(),
    user,
    handlers: HandlersCollection.find(
      { owner: props.match.params.id },
      {
        sort: { createdAt: -1 },
      },
    ).fetch(),
    userProfile: Meteor.users.findOne(props.match.params.id),
  };
})(UserHandlers));
