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
  Col, notification,
  Modal
} from "antd";
import { Tabs } from 'antd';
import { withTracker } from 'meteor/react-meteor-data';
import HandlersCollection from '../../../api/Handlers/Handlers';
import { withRouter } from 'react-router';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import ManageHandler from './ManageHandler';
import AddPackage from './AddPackage';
import ReadJs from './ReadJs';
import DisplayTimeline from './DisplayTimeline';
import CommentSection from './CommentSection';
import counterFormatter from '../../../modules/counterFormatter';
import { Session } from 'meteor/session';
import ControllerIcon from '../../icons/ControllerIcon';
import KeyboardIcon from '../../icons/KeyboardIcon';
import DisplayStats from './DisplayStats';
const { Paragraph } = Typography;
const IconText = ({ type, text, theme = 'outlined', color }) => (
  <span>
    <Icon type={type} twoToneColor={color} theme={theme} style={{ marginRight: 8 }} />
    {text}
  </span>
);
const { TabPane } = Tabs;
const { confirm } = Modal;
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
  const isMaintainer = props.user && (handler.owner === props.user._id);
  const isAdmin = props.user && Roles.userIsInRole(props.user._id, ['admin_enabled']);


  const confirmReport = () => {

    confirm({
      title: 'Are you sure you want to report this handler?',
      content: 'You can not report a handler because it does not work. Reasons for reporting a handler may include: virus, wrong content (obscene / nudity / ...), dangerous behavior, ...',
      okText: 'Confirm report',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk() {
        Meteor.call('handlers.report', handler._id, (err, res)=>{
          if(err){
            notification.error({ message: 'Error reporting handler', description: err.reason });
          }else{
          notification.success({
            message: 'Handler reported',
            description: `Thank you for submitting your report. We will review this handler soon.`,
          });
          }
        })

      },
      onCancel() {

      },
    });
  };
  const resetReport = () => {

        Meteor.call('handlers.resetReport', handler._id, (err, res)=>{
          if(err){
            notification.error({ message: 'Error resetting reports', description: err.reason });
          }else{
          notification.success({
            message: 'Handler reports reset',
            description: `Handler reports set back to 0.`,
          });
          }
        })
  };
  const verifyHandler = () => {
        Meteor.call('handlers.verify', handler._id, (err, res)=>{
          if(err){
            notification.error({ message: 'Error verifying', description: err.reason });
          }else{
          notification.success({
            message: 'Handler verification',
            description: `The verification status for the latest package of this handler has changed.`,
          });
          }
     })
  };

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
                    <Tag color="green"><Icon type="safety-certificate"  theme="filled" style={{ marginRight: 4 }} /> Verified</Tag>
                  </Tooltip>
                ) : (
                  <Tooltip
                    placement="bottomRight"
                    title="The latest release of this handler has not been verified. Check the FAQ for insight into the verification process."
                  >
                    <Tag><Icon type="exclamation-circle"  style={{ marginRight: 4 }} /> Unverified</Tag>
                  </Tooltip>
                )
              }
              extra={
                <div>
                  {!isMaintainer && !isAdmin && (
                    <Button type="danger" key="1" ghost onClick={confirmReport}>
                      Report handler
                    </Button>
                  )}
                  {isAdmin && (
                    <Button type="danger" key="2" ghost onClick={resetReport}>
                      Reset report count
                    </Button>
                  )}
                  {isAdmin && handler.currentVersion > 0 && (
                    <Button type="primary" key="3" ghost onClick={verifyHandler}>
                      {handler.verified ? "Un-verify" : "Verify"}
                    </Button>
                  )}
                </div>
              }
            >
              <div style={{ color: 'rgba(0, 0, 0, 0.45)' }}>
                <IconText type="team" text={handler.maxPlayers > 2 ? `2 - ${handler.maxPlayers} players` : '2 players'}
                          key="max-players" />
                <div style={{ width: '25px', display: 'inline-block' }}></div>

                {handler.playableControllers && (<><Tooltip title={"Controller support"}>
                  <ControllerIcon style={{ width: 22, height: 22, fill: '#8d8d8d', marginBottom:-6 }} />
                </Tooltip><div style={{ width: '25px', display: 'inline-block' }}></div></>)}

                {handler.playableMouseKeyboard && (<>
                <Tooltip title={`${handler.playableMultiMouseKeyboard ? 'Multiple' : 'Single'} mouse + keyboard support`}>
                  <KeyboardIcon style={{ width: 22, height: 22, fill: '#8d8d8d', marginBottom:-4 }} />
                  {handler.playableMultiMouseKeyboard && (<KeyboardIcon style={{ width: 22, height: 22, fill: '#8d8d8d', marginBottom:-4 }} />)}
                </Tooltip>
                <div style={{ width: '25px', display: 'inline-block' }}></div></>)}
                <IconText type="fire" text={counterFormatter(handler.stars)} key="total-stars" />
                <div style={{ width: '25px', display: 'inline-block' }}></div>
                <IconText
                  type="download"
                  text={counterFormatter(handler.downloadCount)}
                  key="list-vertical-message"
                />
                <div style={{ width: '25px', display: 'inline-block' }}></div>
                <Link to={`/user/${handler.owner}`}><IconText type="user" text={handler.ownerName}
                                                              key="list-vertical-like-o" /></Link>
              </div>
              <Content>
                <div style={{ display: 'flex', flexDirection: 'row' }}>
                  <div style={{ marginLeft:-45, paddingRight:25 }}>
                    <Paragraph>
                      <ReactMarkdown source={handler.description} />
                    </Paragraph>
                    <Row style={{marginTop:45}} className="contentLink" type="flex">
                      {handler.currentVersion > 0 && (
                        <React.Fragment>
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
                            <Button type="primary" icon="download" style={{marginBottom:5}}>
                              Download Handler {handler.currentVersion > 1 && `(v${handler.currentVersion})`}
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
                                <Button style={{marginBottom:5}}>
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
                                  <Button icon="fire" style={{marginBottom:5}}>Give hotness!</Button>
                                </div>
                              </Link>
                            )}
                          </div>
                        </React.Fragment>
                      )}
                      <a
                        style={{
                          marginRight: 16,
                          display: 'flex',
                          alignItems: 'center',
                        }}
                        href={handler.gameUrl}
                        target="_blank"
                      >
                        <Button icon="info-circle" style={{marginBottom:5}}>Game informations</Button>
                      </a>
                    </Row>
                  </div>
                  <div style={{marginRight:-126, paddingLeft:26,marginTop:-84}}>
                    <img
                      src={
                        handler.gameCover !== 'no_cover'
                          ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${handler.gameCover}.jpg`
                          : '/no_image.jpg'
                      }
                      alt="game cover"
                    />
                  </div>
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
              <TabPane
                disabled={!handler.currentVersion}
                tab={
                  <span>
                    <Icon type="line-chart" />
                    Statistics
                  </span>
                }
                key="4"
              >
                <DisplayStats handlerId={handler._id} />
              </TabPane>
              {(isMaintainer || isAdmin) && (
                <TabPane
                  tab={
                    <span>
                      <Icon type="edit" />
                      Edit & Manage
                    </span>
                  }
                  key="5"
                >
                  <Row gutter={48}>
                    <Col span={12}>
                      <ManageHandler
                        handlerId={handler._id}
                        initialDescription={handler.description}
                        initialTitle={handler.title}
                        handlerStatus={handler.private}
                        handlerVersion={handler.currentVersion}
                        maxPlayers={handler.maxPlayers}
                        playableControllers={handler.playableControllers}
                        playableMultiMouseKeyboard={handler.playableMultiMouseKeyboard}
                        playableMouseKeyboard={handler.playableMouseKeyboard}
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
