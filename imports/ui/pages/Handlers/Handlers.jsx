import React, { useState, useEffect } from 'react';
import {
  List,
  Divider,
  Icon,
  Button,
  Tooltip,
  Spin,
  Card,
  Typography,
  Radio,
  AutoComplete,
  Tag,
} from 'antd';
import { withTracker } from 'meteor/react-meteor-data';
import HandlersCollection from '../../../api/Handlers/Handlers';
import counterFormatter from '../../../modules/counterFormatter';
import { Link } from 'react-router-dom';
import Avatars from '@dicebear/avatars';
import sprites from '@dicebear/avatars-gridy-sprites';
import { Session } from 'meteor/session';
import isFromWebview from '../../helpers/isFromWebview';
import ControllerIcon from '../../icons/ControllerIcon';
import KeyboardIcon from '../../icons/KeyboardIcon';

const { Meta } = Card;
let avatars = new Avatars(sprites({}));

const currentSearch = new ReactiveVar('');
const currentOrder = new ReactiveVar('down');
const currentSearchOption = new ReactiveVar('hot');
const currentLimit = new ReactiveVar(18);

const { Title, Paragraph, Text } = Typography;

const IconText = ({ type, text, theme = 'outlined', color }) => (
  <span>
    <Icon type={type} twoToneColor={color} theme={theme} style={{ marginRight: 8 }} />
    {text}
  </span>
);

function Handlers(props) {
  const [searched, setSearched] = useState([]);
  const onSearch = () => {
    setSearched([
      ...new Set(
        props.handlers.map(function(handler) {
          return handler.gameName;
        }),
      ),
    ]);
  };

  const listenToScroll = () => {
    const winScroll = document.body.scrollTop || document.documentElement.scrollTop;

    const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;

    if (height - winScroll < 600 && !props.loading) {
      currentLimit.set(props.currentLimit + 18);
    }
  };

  // This effect control the infinite scrolling.
  useEffect(() => {
    if (props.currentLimit - 18 < props.handlers.length) {
      window.addEventListener('scroll', listenToScroll);
      return () => {
        window.removeEventListener('scroll', listenToScroll);
      };
    }
  }, [props.currentLimit, props.loading]);

  const onChange = value => {
    currentLimit.set(18);
    value === undefined ? currentSearch.set('') : currentSearch.set(value);
  };

  const onSortTypeChange = value => {
    currentLimit.set(18);
    currentSearchOption.set(value.target.value);
  };

  const onSortOrderChange = value => {
    if (props.currentSearchOption === value.target.value) {
      currentOrder.set(props.currentOrder === 'down' ? 'up' : 'down');
    } else {
      currentOrder.set('down');
    }
  };

  const star = handlerId => {
    Meteor.call('handlers.starring', handlerId);
  };

  const [totalHandlers, setTotalHandlers] = useState('...');

  useEffect(() => {
    Meteor.call('handlers.countPublic', (err, res) => {
      if(!err) {
        setTotalHandlers(res);
      }
    })
  }, [])

  const isAdmin = props.user && Roles.userIsInRole(props.user._id, ['admin_enabled']);

  return (
    <div>
      {!isFromWebview.get() && (<Typography>
        <Title aria-label="aria-expanded">Explore handlers</Title>
        <Paragraph aria-label="aria-level">Search for games you like and play them with your friends.</Paragraph>
      </Typography>)}
      <label htmlFor="handlers-search-autocomplete" aria-label="landmark">
        <AutoComplete
          id="handlers-search-autocomplete"
          aria-label="search"
          value={currentSearch.get()}
          allowClear={true}
          dataSource={searched}
          style={{ width: 350 }}
          onSearch={onSearch}
          onChange={onChange}
          placeholder={`Search among ${totalHandlers} games...`}
        />
      </label>
      <Radio.Group
        style={{ float:'right' }}
        value={currentSearchOption.get()}
        onChange={onSortTypeChange}
      >
        <Radio.Button onClick={onSortOrderChange} value="hot">
          {props.currentSearchOption === 'hot' && <Icon type={props.currentOrder} />} Hottest
        </Radio.Button>
        <Radio.Button onClick={onSortOrderChange} value="download">
          {props.currentSearchOption === 'download' && <Icon type={props.currentOrder} />} Downloads
        </Radio.Button>
        <Radio.Button onClick={onSortOrderChange} value="latest">
          {props.currentSearchOption === 'latest' && <Icon type={props.currentOrder} />} Release
          date
        </Radio.Button>
        <Radio.Button onClick={onSortOrderChange} value="alphabetical">
          {props.currentSearchOption === 'alphabetical' && <Icon type={props.currentOrder} />} Alphabetical
        </Radio.Button>
        {isAdmin && (
          <Radio.Button onClick={onSortOrderChange} value="report">
            {props.currentSearchOption === 'report' && <Icon type={props.currentOrder} />} Reports
          </Radio.Button>
        )}
      </Radio.Group>
      <br />
      <Divider style={{opacity:0}} />
      <Spin spinning={props.loading}>
        {isFromWebview.get() ? (
          <List
            locale={{ emptyText: 'Sorry ! No game found 😞' }}
            itemLayout="vertical"
            size="large"
            grid={{
              gutter: 15,
              xs: 1
            }}
            dataSource={[...props.localHandlers.map(handler => ({...handler, local: true})),...props.handlers]}
            footer={
              <div>
                <b>SplitScreen.Me</b> compatible handlers.
              </div>
            }
            renderItem={item => (
              <List.Item key={item._id} style={{ paddingBottom: '6px'}}>
                <Card bodyStyle={{padding:0}}
                >
                  <div style={{display:'flex', flexDirection:'row'}}>
                  <Link
                    id={'handler-card-' + item._id}
                    to={`/handler/${item._id}`}
                    alt={'link to ' + item.gameName}
                  >
                    <div
                      style={{
                        position:'relative',
                        width: '80px',
                        height: '110px',
                        borderRadius:5,
                        backgroundSize: 'cover',
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'center center',
                        backgroundImage: `url(${
                          item.gameCover !== 'no_cover'
                            ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${item.gameCover}.jpg`
                            : '/no_image.jpg'
                        })`,
                      }}
                      alt={'Game Cover for ' + item.gameName}
                    >
                      {item.local && (<div style={{width:20, height:20, top:-5,left:-5,position:'absolute'}}>
                        <Icon style={{fontSize:18,borderRadius:1000, boxShadow: 'rgb(82 196 26 / 30%) 2px 1px 15px 0px'}} type="check-circle" theme="twoTone" twoToneColor="#52c41a" />
                      </div>)}
                    </div>
                  </Link>
                    <Card
                      className={'ant-card-nhover'}
                      bordered={false}
                      style={{ width: '100%' }}
                      actions={[
                        <div style={{cursor:'default'}}><IconText type="team" text={item.maxPlayers > 2 ? `2 - ${item.maxPlayers} players` : '2 players'}
                                        key="max-players" /></div>,
                        <div style={{cursor:'default'}}>
                          {!item.playableControllers && !item.playableMouseKeyboard && (<div style={{fontSize:10}}>No specified device support</div>)}
                          {item.playableControllers && (<><Tooltip title={"Controller support"}>
                            <ControllerIcon style={{ width: 22, height: 22, fill: '#8d8d8d', marginBottom:-6 }} />
                          </Tooltip><div style={{ width: '25px', display: 'inline-block' }}></div></>)}

                          {item.playableMouseKeyboard && (<>
                            <Tooltip title={`${item.playableMultiMouseKeyboard ? 'Multiple' : 'Single'} mouse + keyboard support`}>
                              <KeyboardIcon style={{ width: 22, height: 22, fill: '#8d8d8d', marginBottom:-4 }} />
                              {item.playableMultiMouseKeyboard && (<KeyboardIcon style={{ width: 22, height: 22, fill: '#8d8d8d', marginBottom:-4 }} />)}
                            </Tooltip></>)}
                        </div>,
                        props.user ? (
                          <Tooltip title={`Total hotness`}><div onClick={() => star(item._id)}>
                            <IconText
                              type="fire"
                              theme={
                                props.user.profile.starredHandlers.includes(item._id)
                                  ? 'twoTone'
                                  : 'outlined'
                              }
                              text={item.stars}
                              color="#eb2f96"
                              key="list-vertical-star-o"
                            />
                          </div></Tooltip>
                        ) : (
                          <Tooltip title={`Total hotness`}><Link
                            onClick={() => {
                              Session.set('loginModal', true);
                            }}
                            to="#"
                          >
                            <div>
                              <IconText type="fire" text={item.stars} key="list-vertical-star-o" />
                            </div>
                          </Link></Tooltip>
                        ),
                          <Tooltip title={"Total downloads"}>
                            <Link to={`/handler/${item._id}`}>
                              <IconText
                                type="download"
                                text={counterFormatter(item.downloadCount)}
                                key="view"
                              />
                            </Link>
                          </Tooltip>
                        ,
                          <Tooltip title={"Comments"}>
                            <Link to={`/handler/${item._id}`}>
                              <IconText
                                type="message"
                                text={counterFormatter(item.commentCount)}
                                key="comCount"
                              />
                            </Link>
                          </Tooltip>
                        ,
                        ...(isAdmin
                          ? [
                            <Link to={`/handler/${item._id}`}>
                              <IconText
                                type="warning"
                                text={counterFormatter(item.reports)}
                                key="reportCount"
                              />
                            </Link>,
                          ]
                          : []),
                      ]}>
                      <Meta
                        style={{ height: '21px' }}
                        description={
                          <div style={{ paddingTop: 5, display:'flex',flexDirection:'row' }}>
                            <div style={{marginTop:'-5px', fontSize:16,marginRight:8}}>
                            <Tooltip
                              placement="bottomLeft"
                              title={
                                item.verified
                                  ? 'The latest release of this handler has been validated by our team and is safe to use.'
                                  : 'The latest release of this handler has not been verified. Check the FAQ for insight into the verification process.'
                              }
                            >
                              {item.verified ? (
                                <Icon type="safety-certificate" theme="twoTone" twoToneColor="#52c41a" />
                              ) : (
                                <Icon type="exclamation-circle" />
                              )}
                            </Tooltip>
                            </div>
                            <div style={{marginTop:'-8px'}}>
                              <Link style={{fontSize:19, fontWeight:500}} to={`/handler/${item._id}`}>{item.gameName}</Link>
                            </div>
                            <div style={{marginTop:'-3px', marginLeft:25}}>
                              <Link to={`/user/${item.owner}`}>
                                <IconText type="user" text={item.ownerName} key="creator" />
                              </Link>
                            </div>
                            <div style={{ flexGrow: 1, textAlign: 'right', marginTop: '-5px' }}>
                              {!props.localHandlerLibraryArray?.map(handler => handler.id)?.includes(item._id) ? (
                                <a
                                  href={`/cdn/storage/packages/${
                                    item.currentPackage
                                  }/original/handler-${item._id.toLowerCase()}-v${
                                    item.currentVersion
                                  }.nc?download=true`}
                                  download={`handler-${item._id.toLowerCase()}-v${
                                    item.currentVersion
                                  }.nc`}
                                  target="_parent"
                                >
                                  <Button type="primary" icon="play-circle">
                                    Install
                                  </Button>
                                </a>) : (props.localHandlerLibraryArray?.find(handler => handler.id === item._id).version !== item.currentVersion ? (
                                <a
                                  href={`/cdn/storage/packages/${
                                    item.currentPackage
                                  }/original/handler-${item._id.toLowerCase()}-v${
                                    item.currentVersion
                                  }.nc?download=true`}
                                  download={`handler-${item._id.toLowerCase()}-v${
                                    item.currentVersion
                                  }.nc`}
                                  target="_parent"
                                >
                                  <Button type="primary" style={{backgroundColor:"#e99c18", borderColor:"#e99c18"}} icon="sync">
                                    Update (v{props.localHandlerLibraryArray?.find(handler => handler.id === item._id).version} ➜ v{item.currentVersion})
                                  </Button>
                                </a>
                              ) : (
                                <Tag color="#87d068">Up-to-date</Tag>
                              ))}


                            </div>
                          </div>
                        }
                      />
                    </Card>
                  </div>
                </Card>
              </List.Item>
            )}
          />
        ) : (
          <List
            size="large"
            locale={{ emptyText: 'Sorry ! No game found 😞' }}
            grid={{
              gutter: 15,
              xs: 1,
              sm: 2,
              md: 2,
              lg: 3,
              xl: 4,
              xxl: 6,
            }}
            dataSource={props.handlers}
            footer={
              <div>
                <b>SplitScreen.Me</b> compatible handlers.
              </div>
            }
            renderItem={item => (
              <List.Item key={item._id} style={{ paddingBottom: '10px' }}>
                <Card
                  cover={
                    <Link
                      id={'handler-card-' + item._id}
                      to={`/handler/${item._id}`}
                      alt={'link to ' + item.gameName}
                    >
                    <div
                        style={{
                          width: 'auto',
                          height: '380px',
                          backgroundSize: 'cover',
                          backgroundRepeat: 'no-repeat',
                          backgroundPosition: 'center center',
                          backgroundImage: `url(${
                            item.gameCover !== 'no_cover'
                              ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${item.gameCover}.jpg`
                              : '/no_image.jpg'
                          })`,
                        }}
                        alt={'Game Cover for ' + item.gameName}
                      />
                    </Link>
                  }
                  actions={[
                    <Tooltip
                      placement="bottomLeft"
                      title={
                        item.verified
                          ? 'The latest release of this handler has been validated and is safe to use.'
                          : 'The latest release of this handler has not been verified. Check the FAQ for insight into the verification process.'
                      }
                    >
                      {item.verified ? (
                        <Icon type="safety-certificate" theme="twoTone" twoToneColor="#52c41a" />
                      ) : (
                        <Icon type="exclamation-circle" />
                      )}
                    </Tooltip>,
                    props.user ? (
                      <div onClick={() => star(item._id)}>
                        <IconText
                          type="fire"
                          theme={
                            props.user.profile.starredHandlers.includes(item._id)
                              ? 'twoTone'
                              : 'outlined'
                          }
                          text={item.stars}
                          color="#eb2f96"
                          key="list-vertical-star-o"
                        />
                      </div>
                    ) : (
                      <Link
                        onClick={() => {
                          Session.set('loginModal', true);
                        }}
                        to="#"
                      >
                        <div>
                          <IconText type="fire" text={item.stars} key="list-vertical-star-o" />
                        </div>
                      </Link>
                    ),
                    item.downloadCount > 999 ? (
                      <Tooltip placement="bottomLeft" title={item.downloadCount} arrowPointAtCenter>
                        <Link to={`/handler/${item._id}`}>
                          <IconText
                            type="download"
                            text={counterFormatter(item.downloadCount)}
                            key="view"
                          />
                        </Link>
                      </Tooltip>
                    ) : (
                      <Link to={`/handler/${item._id}`}>
                        <IconText
                          type="download"
                          text={counterFormatter(item.downloadCount)}
                          key="view"
                        />
                      </Link>
                    ),
                    item.commentCount > 999 ? (
                      <Tooltip placement="bottomLeft" title={item.downloadCount} arrowPointAtCenter>
                        <Link to={`/handler/${item._id}`}>
                          <IconText
                            type="message"
                            text={counterFormatter(item.commentCount)}
                            key="comCount"
                          />
                        </Link>
                      </Tooltip>
                    ) : (
                      <Link to={`/handler/${item._id}`}>
                        <IconText
                          type="message"
                          text={counterFormatter(item.commentCount)}
                          key="comCount"
                        />
                      </Link>
                    ),
                    ...(isAdmin
                      ? [
                        <Link to={`/handler/${item._id}`}>
                          <IconText
                            type="warning"
                            text={counterFormatter(item.reports)}
                            key="reportCount"
                          />
                        </Link>,
                      ]
                      : []),
                  ]}
                >
                  <Meta
                    style={{ height: '63px' }}
                    title={
                      <div>
                        <Link to={`/handler/${item._id}`}>{item.gameName}</Link>
                      </div>
                    }
                    description={
                      <div style={{ paddingTop: '5px' }}>
                        <div
                          style={{
                            float: 'left',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {item.title}
                        </div>
                        <br />
                        <div
                          style={{
                            float: 'left',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          <Link to={`/user/${item.owner}`}>
                            <IconText type="user" text={item.ownerName} key="creator" />
                          </Link>
                        </div>
                      </div>
                    }
                  />
                </Card>
              </List.Item>
            )}
          />
        )}
      </Spin>
    </div>
  );
}

export default withTracker(() => {
  const reactiveCurrentOrder = currentOrder.get();

    const subscriptionForLocalHandlers = Meteor.subscribe(
      'handlers',
      currentSearch.get(),
      currentSearchOption.get(),
      reactiveCurrentOrder,
      currentLimit.get(),
      Session.get('localHandlerLibraryArray')?.map(handler => handler.id) || [],
    );

  const subscription = Meteor.subscribe(
    'handlers',
    currentSearch.get(),
    currentSearchOption.get(),
    reactiveCurrentOrder,
    currentLimit.get(),
  );


  const user = Meteor.user();

  let sortObject = { stars: reactiveCurrentOrder === 'up' ? 1 : -1 };
  if (currentSearchOption.get() === 'download') {
    sortObject = { downloadCount: reactiveCurrentOrder === 'up' ? 1 : -1 };
  }
  if (currentSearchOption.get() === 'latest') {
    sortObject = { createdAt: reactiveCurrentOrder === 'up' ? 1 : -1 };
  }
  if (currentSearchOption.get() === 'report') {
    sortObject = { reports: reactiveCurrentOrder === 'up' ? 1 : -1 };
  }
  if (currentSearchOption.get() === 'alphabetical') {
    sortObject = { gameName: reactiveCurrentOrder === 'up' ? -1 : 1 };
  }

  return {
    loading: !subscription.ready() || !subscriptionForLocalHandlers.ready(),
    user,
    currentLimit: currentLimit.get(),
    currentSearchOption: currentSearchOption.get(),
    currentOrder: reactiveCurrentOrder,
    localHandlerLibraryArray: Session.get('localHandlerLibraryArray'),
    localHandlers: HandlersCollection.find(
      {_id: { $in: Session.get('localHandlerLibraryArray')?.map(handler => handler.id) || [] }},
      {
        sort: sortObject,
      },
    ).fetch(),
    handlers: HandlersCollection.find(
      {_id: { $nin: Session.get('localHandlerLibraryArray')?.map(handler => handler.id) || [] }},
      {
        sort: sortObject,
        limit: currentLimit.get(),
      },
    ).fetch(),
  };
})(Handlers);
