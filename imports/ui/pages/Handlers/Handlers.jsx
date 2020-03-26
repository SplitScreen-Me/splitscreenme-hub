import React, { useState } from 'react';
import { List, Divider, Icon, Button, Tooltip, Spin, Card, Typography, Radio } from 'antd';
import { AutoComplete } from 'antd';
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

const { Title, Paragraph, Text } = Typography;

const IconText = ({ type, text, theme = 'outlined', color }) => (
  <span>
    <Icon type={type} twoToneColor={color} theme={theme} style={{ marginRight: 8 }} />
    {text}
  </span>
);

function Handlers(props) {
  const [searched, setSearched] = useState([]);
  const [pagination, setPagination] = useState(1);
  const onSearch = () => {
    setSearched([
      ...new Set(
        props.handlers.map(function(handler) {
          return handler.gameName;
        }),
      ),
    ]);
  };

  const onChange = value => {
    setPagination(1);
    currentSearch.set(value);
  };
  const onSortTypeChange = value => {
    setPagination(1);

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
      </Radio.Group>
      <br />
      <Divider />
      <Spin spinning={props.loading}>
        <List
          size="large"
          grid={{
            gutter: 24,
            xs: 1,
            sm: 2,
            md: 4,
            lg: 4,
            xl: 4,
            xxl: 6,
          }}
          pagination={{
            onChange: page => {
              setPagination(page);
            },
            current: pagination,
            pageSize: 18,
            position: 'both',
          }}
          dataSource={props.handlers}
          footer={
            <div>
              <b>SplitScreen.Me</b> compatible handlers.
            </div>
          }
          header={<div></div>}
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
                  <Link to={`/handler/${item._id}`}>
                    <IconText type="download" text={item.downloadCount} key="view" />
                  </Link>,
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
                  description={item.title}
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
  const subscription = Meteor.subscribe('handlers', currentSearch.get(), currentSearchOption.get(), reactiveCurrentOrder);
  const user = Meteor.user();

  let sortObject = { stars: reactiveCurrentOrder === "up" ? 1 : -1 };
  if (currentSearchOption.get() === 'download') {
    sortObject = { downloadCount: reactiveCurrentOrder === "up" ? 1 : -1 };
  }
  if (currentSearchOption.get() === 'latest') {
    sortObject = { createdAt: reactiveCurrentOrder === "up" ? 1 : -1 };
  }
  return {
    loading: !subscription.ready(),
    user,
    currentSearchOption: currentSearchOption.get(),
    currentOrder: reactiveCurrentOrder,
    handlers: HandlersCollection.find(
      {},
      {
        sort: sortObject,
        limit: 500,
      },
    ).fetch(),
  };
})(Handlers);
