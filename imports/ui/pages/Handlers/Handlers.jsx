import React, { useState, useEffect } from 'react';
import { List, Divider, Icon, Button, Tooltip, Spin, Card, Typography, Radio, AutoComplete } from 'antd';
import { withTracker } from 'meteor/react-meteor-data';
import HandlersCollection from '../../../api/Handlers/Handlers';
import { Link } from 'react-router-dom';
import Avatars from '@dicebear/avatars';
import sprites from '@dicebear/avatars-gridy-sprites';
import { Session } from 'meteor/session';
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

  function mAndKFormatter(num) {
    return Math.abs(num) > 999500 ?
        Math.sign(num)*((Math.abs(num)/1000000).toFixed(0)) + 'm' :
        Math.abs(num) > 999 ?
            Math.sign(num)*((Math.abs(num)/1000).toFixed(0)) + 'k' :
            Math.sign(num)*Math.abs(num)
  }

  const listenToScroll = () => {
    const winScroll =
      document.body.scrollTop || document.documentElement.scrollTop;

    const height =
      document.documentElement.scrollHeight -
      document.documentElement.clientHeight;

    if(height - winScroll < 600 && !props.loading){
      currentLimit.set(props.currentLimit + 18);
    }
  };

  // This effect control the infinite scrolling.
  useEffect(()=>{
    if(props.currentLimit - 18 < props.handlers.length) {
        window.addEventListener('scroll', listenToScroll);
        return ()=> {window.removeEventListener('scroll', listenToScroll)};
    }
  },[props.currentLimit, props.loading]);

  const onChange = value => {
    currentLimit.set(18)
    currentSearch.set(value);
  };

  const onSortTypeChange = value => {
    currentLimit.set(18)
    currentSearchOption.set(value.target.value);
  };

  const onSortOrderChange = value => {
    if(props.currentSearchOption === value.target.value){
      currentOrder.set(props.currentOrder === "down" ? "up" : "down");
    }else{
      currentOrder.set("down");
    }
  };

  const star = handlerId => {
    Meteor.call('handlers.starring', handlerId);
  };

  const isAdmin = props.user && Roles.userIsInRole(props.user._id, ['admin_enabled']);

  return (
    <div>
      <Typography>
        <Title>Explore handlers</Title>
        <Paragraph>Search for games you like and play them with your friends.</Paragraph>
      </Typography>
      <AutoComplete
        value={currentSearch.get()}
        dataSource={searched}
        style={{ width: 350 }}
        onSearch={onSearch}
        onChange={onChange}
        placeholder="Search any handler"
      />
      <Radio.Group
        style={{ marginLeft: '50px' }}
        value={currentSearchOption.get()}
        onChange={onSortTypeChange}
      >
        <Radio.Button onClick={onSortOrderChange} value="hot">{props.currentSearchOption === "hot" && <Icon type={props.currentOrder} />} Hottest</Radio.Button>
        <Radio.Button onClick={onSortOrderChange} value="download">{props.currentSearchOption === "download" && <Icon type={props.currentOrder} />} Downloads</Radio.Button>
        <Radio.Button onClick={onSortOrderChange} value="latest">{props.currentSearchOption === "latest" && <Icon type={props.currentOrder} />} Release date</Radio.Button>
        {isAdmin && <Radio.Button onClick={onSortOrderChange} value="report">{props.currentSearchOption === "report" && <Icon type={props.currentOrder} />} Reports</Radio.Button>}
      </Radio.Group>
      <br />
      <Divider />
      <Spin spinning={props.loading}>
        <List
          size="large"
          grid={{
            gutter: 10,
            xs: 1,
            sm: 2,
            md: 3,
            lg: 4,
            xl: 4,
            xxl: 5,
          }}
          dataSource={props.handlers}
          footer={
            <div>
              <b>SplitScreen.Me</b> compatible handlers.
            </div>
          }
          renderItem={item => (
            <List.Item key={item._id}>
              <Card
                cover={
                  <Link to={`/handler/${item._id}`}>
                    <div
                      style={{
                        width: 'auto',
                        height: '360px',
                        backgroundSize: 'cover',
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'center center',
                        backgroundImage: `url(${
                          item.gameCover !== 'no_cover'
                            ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${item.gameCover}.jpg`
                            : '/no_image.jpg'
                        })`,
                      }}
                      alt="Game cover"
                    />
                  </Link>
                }
                actions={[
                  <Tooltip
                    placement="bottomLeft"
                    title={item.verified ? "The latest release of this handler has been validated and is safe to use." : "The latest release of this handler has not been verified. Check the FAQ for insight into the verification process."}
                  >
                  {item.verified ? <Icon type="safety-certificate" theme="twoTone" twoToneColor="#52c41a" /> : <Icon type="exclamation-circle" />}
                  </Tooltip>
                  ,
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
                  item.downloadCount >= 1000 ? (
                    <Tooltip placement="bottomLeft" title={item.downloadCount} arrowPointAtCenter>
                      <Link to={`/handler/${item._id}`}>
                        <IconText type="download" text={mAndKFormatter(item.downloadCount)} key="view" />
                      </Link>
                    </Tooltip>
                  ) : (
                    <Link to={`/handler/${item._id}`}>
                      <IconText type="download" text={mAndKFormatter(item.downloadCount)} key="view" />
                    </Link>
                  ),
                  <Link to={`/handler/${item._id}`}>
                    <IconText type="message" text={item.commentCount} key="comCount" />
                  </Link>,
                  ...(!!isAdmin && [<Link to={`/handler/${item._id}`}>
                    <IconText type="warning" text={item.reports} key="reportCount" />
                  </Link>])
                ]}
              >
                <Meta
                  style={{ height: '63px' }}
                  // avatar={<div style={{width:'35px', height:'35px'}} dangerouslySetInnerHTML={{__html:avatars.create(item.ownerName) }} />}
                  title={
                    <div>
                      <Link to={`/handler/${item._id}`}>{item.gameName}</Link>
                    </div>
                  }
                  description={
                    <div style={{ paddingTop: '10px' }}>
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
      </Spin>
    </div>
  );
}
export default withTracker(() => {
  const reactiveCurrentOrder = currentOrder.get();
  const subscription = Meteor.subscribe('handlers', currentSearch.get(), currentSearchOption.get(), reactiveCurrentOrder, currentLimit.get());
  const user = Meteor.user();

  let sortObject = { stars: reactiveCurrentOrder === "up" ? 1 : -1 };
  if (currentSearchOption.get() === 'download') {
    sortObject = { downloadCount: reactiveCurrentOrder === "up" ? 1 : -1 };
  }
  if (currentSearchOption.get() === 'latest') {
    sortObject = { createdAt: reactiveCurrentOrder === "up" ? 1 : -1 };
  }
  if (currentSearchOption.get() === 'report') {
    sortObject = { reports: reactiveCurrentOrder === "up" ? 1 : -1 };
  }

  return {
    loading: !subscription.ready(),
    user,
    currentLimit: currentLimit.get(),
    currentSearchOption: currentSearchOption.get(),
    currentOrder: reactiveCurrentOrder,
    handlers: HandlersCollection.find(
      {},
      {
        sort: sortObject,
        limit: currentLimit.get(),
      },
    ).fetch(),
  };
})(Handlers);
