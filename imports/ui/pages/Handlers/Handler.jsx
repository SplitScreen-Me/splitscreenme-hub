import React, { useState } from 'react';
import {
  Icon,
  Button,
  Tooltip,
  Spin,
  PageHeader,
  Typography,
  Row,
  Tag,
  Result,
  Skeleton,
  Col,
} from 'antd';
import { Descriptions, Tabs } from 'antd';
import { withTracker } from 'meteor/react-meteor-data';
import HandlersCollection from '../../../api/Handlers/Handlers';
import { withRouter } from 'react-router';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import SyntaxHighlighter from 'react-syntax-highlighter';
import ManageHandler from './ManageHandler';
import AddPackage from './AddPackage';
import ReadJs from './ReadJs';
import DisplayTimeline from './DisplayTimeline';
import CommentSection from './CommentSection';
import counterFormatter from '../../../modules/counterFormatter';
import { Session } from 'meteor/session';
const { Paragraph } = Typography;
const IconText = ({ type, text, theme = 'outlined', color }) => (
  <span>
    <Icon type={type} twoToneColor={color} theme={theme} style={{ marginRight: 8 }} />
    {text}
  </span>
);
const { TabPane } = Tabs;
const IconLink = ({ src, text, href, target }) => (
  <a
    style={{
      marginRight: 16,
      display: 'flex',
      alignItems: 'center',
    }}
    href={href}
    target={target}
  >
    <img
      style={{
        marginRight: 8,
      }}
      src={src}
      alt="start"
    />
    {text}
  </a>
);
const Content = ({ children, extraContent }) => {
  return (
    <Row className="content" type="flex">
      <div className="main" style={{ flex: 1 }}>
        {children}
      </div>
      <div
        className="extra"
        style={{
          marginLeft: 80,
        }}
      >
        {extraContent}
      </div>
    </Row>
  );
};

const onCheckPublic = checked => {
  console.log(`switch to ${checked}`);
};

function Handler(props) {
  const star = handlerId => {
    Meteor.call('handlers.starring', handlerId);
  };
  const handler = props.handler[0] ? props.handler[0] : false;
  const isMaintainer = props.user && handler.owner === props.user._id;
  return (
    <div>
      <Spin spinning={props.loading}>
        {handler ? (
          <React.Fragment>
            <PageHeader
              title={handler.gameName}
              subTitle={handler.title}
              tags={
                handler.verified ? (
                  <Tooltip
                    placement="topRight"
                    title="The latest release of this handler has been validated and is safe to use."
                  >
                    <Tag color="green">Verified</Tag>
                  </Tooltip>
                ) : (
                  <Tooltip
                    placement="bottomRight"
                    title="The latest release of this handler has not been verified. Check the FAQ for insight into the verification process."
                  >
                    <Tag>Unverified</Tag>
                  </Tooltip>
                )
              }
              extra={
                <div>
                  {!isMaintainer && (
                    <Button type="danger" key="1" ghost>
                      Report handler
                    </Button>
                  )}
                </div>
              }
            >
              <div style={{ color: 'rgba(0, 0, 0, 0.45)' }}>
                <IconText type="fire" text={counterFormatter(handler.stars)} key="total-stars" />
                <div style={{ width: '25px', display: 'inline-block' }}> </div>
                <IconText
                  type="download"
                  text={counterFormatter(handler.downloadCount)}
                  key="list-vertical-message"
                />
                <div style={{ width: '25px', display: 'inline-block' }}> </div>
                <IconText type="user" text={handler.ownerName} key="list-vertical-like-o" />
              </div>
              <Content
                extraContent={
                  <img
                    src={
                      handler.gameCover !== 'no_cover'
                        ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${handler.gameCover}.jpg`
                        : '/no_image.jpg'
                    }
                    alt="game cover"
                  />
                }
              >
                <div>
                  <Paragraph>
                    <ReactMarkdown source={handler.description} />
                  </Paragraph>
                  <Row className="contentLink" type="flex">
                    <a
                      style={{
                        marginRight: 16,
                        display: 'flex',
                        alignItems: 'center',
                      }}
                      href={`/cdn/storage/packages/${
                        handler.currentPackage
                      }/original/handler-${handler._id.toLowerCase()}-v${
                        handler.currentVersion
                      }.nc?download=true`}
                      download={`handler-${handler._id.toLowerCase()}-v${
                        handler.currentVersion
                      }.nc`}
                      target="_parent"
                    >
                      <Button type="primary" ghost icon="download">
                        Download Handler
                      </Button>
                    </a>
                    <div
                      style={{
                        marginRight: 16,
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      {props.user ? (
                        <div onClick={() => star(handler._id)}>
                          <Button>
                            <IconText
                              type="fire"
                              theme={
                                props.user.profile.starredHandlers.includes(handler._id)
                                  ? 'twoTone'
                                  : 'outlined'
                              }
                              text={
                                props.user.profile.starredHandlers.includes(handler._id)
                                  ? 'Hot!'
                                  : 'Give hotness!'
                              }
                              color="#eb2f96"
                              key="list-vertical-star-o"
                            />{' '}
                          </Button>
                        </div>
                      ) : (
                        <Link
                          onClick={() => {
                            Session.set('loginModal', true);
                          }}
                          to="#"
                        >
                          <div>
                            <Button icon="fire">Give hotness!</Button>
                          </div>
                        </Link>
                      )}
                    </div>
                    <a
                      style={{
                        marginRight: 16,
                        display: 'flex',
                        alignItems: 'center',
                      }}
                      href={handler.gameUrl}
                      target="_blank"
                    >
                      <Button icon="info-circle">Game informations</Button>
                    </a>
                  </Row>
                </div>
              </Content>
            </PageHeader>
            <Tabs defaultActiveKey={handler.currentVersion ? '1' : '4'}>
              <TabPane
                disabled={!handler.currentVersion}
                tab={
                  <span>
                    <Icon type="message" />
                    Comments ({handler.commentCount})
                  </span>
                }
                key="1"
              >
                <CommentSection handlerId={handler._id} />
              </TabPane>
              <TabPane
                disabled={!handler.currentVersion}
                tab={
                  <span>
                    <Icon type="code" />
                    JS Code
                  </span>
                }
                key="2"
              >
                <ReadJs packageId={handler.currentPackage} />
              </TabPane>
              <TabPane
                disabled={!handler.currentVersion}
                tab={
                  <span>
                    <Icon type="history" />
                    Versions history ({handler.currentVersion})
                  </span>
                }
                key="3"
              >
                <DisplayTimeline handlerId={handler._id} />
              </TabPane>
              {isMaintainer && (
                <TabPane
                  tab={
                    <span>
                      <Icon type="edit" />
                      Edit & Manage
                    </span>
                  }
                  key="4"
                >
                  <Row gutter={48}>
                    <Col span={12}>
                      <ManageHandler
                        handlerId={handler._id}
                        initialDescription={handler.description}
                        initialTitle={handler.title}
                        handlerStatus={handler.private}
                        handlerVersion={handler.currentVersion}
                      />
                    </Col>
                    <Col span={12}>
                      <AddPackage handlerId={handler._id} />
                    </Col>
                  </Row>
                </TabPane>
              )}
            </Tabs>
          </React.Fragment>
        ) : props.loading ? (
          <Skeleton avatar paragraph={{ rows: 6 }} />
        ) : (
          <Result
            status="404"
            title="404"
            subTitle="Sorry, this handler does not exist."
            extra={
              <Link to="/">
                <Button type="primary">Search handlers</Button>
              </Link>
            }
          />
        )}
      </Spin>
    </div>
  );
}
export default withRouter(
  withTracker(props => {
    const subscription = Meteor.subscribe('handlers.view', props.match.params.id);

    const user = Meteor.user();
    return {
      loading: !subscription.ready(),
      user,
      handler: HandlersCollection.find().fetch(),
    };
  })(Handler),
);
