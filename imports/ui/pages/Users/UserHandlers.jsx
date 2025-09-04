import React, { useState } from "react";
import {
  List,
  Avatar,
  Icon,
  Tabs,
  PageHeader,
  Alert,
  Typography,
  Divider,
  Descriptions,
  Card,
  Spin,
  AutoComplete,
  Tooltip
} from "antd";
import { Result, Button } from "antd";
import { withTracker } from "meteor/react-meteor-data";
import HandlersCollection from "../../../api/Handlers/Handlers";
import { Link } from "react-router-dom";
import Moment from "react-moment";
import counterFormatter from "../../../modules/counterFormatter";
import { Session } from "meteor/session";
import { withRouter } from "react-router";
import escapeRegExp from "../../../modules/regexescaper";

const { TabPane } = Tabs;
const { Title, Paragraph, Text } = Typography;
const IconText = ({ type, text, ...rest }) => (
  <span {...rest}>
    <Icon type={type} style={{ marginRight: 8 }} />
    {text}
  </span>
);
const { Meta } = Card;
const currentSearch = new ReactiveVar("");

function UserHandlers(props) {
  const [searched, setSearched] = useState([]);
  const onSearch = () => {
    setSearched([
      ...new Set(
        props.users.map(function(us) {
          return { value: `userid:${us._id}`, text: us.profile.username };
        })
      )
    ]);
  };

  const onChange = value => {
    // Weird trick...
    if (value.split("userid:").length > 1) {
      props.history.push(`/user/${value.split("userid:")[1]}`); // Really weird trick...
      currentSearch.set("");
    } else {
      currentSearch.set(value);
    }
  };

  return (
    <div>
      <Typography>
        <Title>Contributors</Title>
        <Paragraph>Search for contributors in our amazing community.</Paragraph>
      </Typography>
      <AutoComplete
        style={{ width: 350 }}
        value={currentSearch.get()}
        dataSource={currentSearch.get().length > 1 ? searched : []}
        onSearch={onSearch}
        onChange={onChange}
        placeholder="Search for contributors"
      />
      <Divider />
      {props.match.params.id ? (
        <Spin spinning={props.loading}>
          <PageHeader
            onBack={() => props.history.push("/user")}
            title={`${props.loading ? "Loading..." : props.userProfile.profile.username}`}
            subTitle="'s public profile"
          >
            <div className="content">
              <div className="main">
                <Descriptions title="Stats & informations">
                  <Descriptions.Item label="Published handlers count">
                    {props.loading ? 0 : props.handlers.length}
                  </Descriptions.Item>
                  <Descriptions.Item label="Published handlers hotness">
                    {props.loading
                      ? 0
                      : props.handlers.reduce((total, current) => total + current.stars, 0)}
                  </Descriptions.Item>
                  <Descriptions.Item label="Published handlers downloads">
                    {props.loading
                      ? 0
                      : props.handlers.reduce((total, current) => total + current.downloadCount, 0)}
                  </Descriptions.Item>
                </Descriptions>
                <Divider />
                <Descriptions title="Contributions" />
                <List
                  size="small"
                  pagination={{
                    onChange: page => {
                    },
                    pageSize: 5
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
                      actions={[]}
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
                              style={{ float: "left", marginRight: "50px" }}
                              alt="logo"
                              src={
                                item.gameCover !== "no_cover"
                                  ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${item.gameCover}.jpg`
                                  : "/no_image.jpg"
                              }
                            />
                            <div>
                              <Link to={`/handler/${item._id}`}>{item.title}</Link> <br />
                              <Text type="secondary" style={{ fontSize: "12px" }}>
                                {item.gameName}
                              </Text>
                              <br />
                              <span>
                                Last update{" "}
                                <Moment format="YYYY-MM-DD HH:mm">{item.updatedAt}</Moment>
                              </span>
                              <br />
                              <br />
                              {item.stars > 999 ? (
                                <Tooltip
                                  placement="bottomLeft"
                                  title={item.downloadCount}
                                  arrowPointAtCenter
                                >
                                  <Link to={`/handler/${item._id}`}>
                                    <IconText
                                      type="fire"
                                      text={counterFormatter(item.stars)}
                                      key="list-vertical-star-o"
                                    />
                                  </Link>
                                </Tooltip>
                              ) : (
                                <Link to={`/handler/${item._id}`}>
                                  <IconText
                                    type="fire"
                                    text={counterFormatter(item.stars)}
                                    key="list-vertical-star-o"
                                  />
                                </Link>
                              )}
                              {item.downloadCount > 999 ? (
                                <Tooltip
                                  placement="bottomLeft"
                                  title={item.downloadCount}
                                  arrowPointAtCenter
                                >
                                  <Link to={`/handler/${item._id}`} style={{ marginLeft: "25px" }}>
                                    <IconText
                                      type="download"
                                      text={counterFormatter(item.downloadCount)}
                                      key="list-vertical-download"
                                    />
                                  </Link>
                                </Tooltip>
                              ) : (
                                <Link to={`/handler/${item._id}`} style={{ marginLeft: "25px" }}>
                                  <IconText
                                    type="download"
                                    text={counterFormatter(item.downloadCount)}
                                    key="list-vertical-download"
                                  />
                                </Link>
                              )}
                              {item.commentCount > 999 ? (
                                <Tooltip
                                  placement="bottomLeft"
                                  title={item.commentCount}
                                  arrowPointAtCenter
                                >
                                  <Link to={`/handler/${item._id}`} style={{ marginLeft: "25px" }}>
                                    <IconText
                                      type="message"
                                      text={counterFormatter(item.commentCount)}
                                      key="list-vertical-message"
                                    />
                                  </Link>
                                </Tooltip>
                              ) : (
                                <Link to={`/handler/${item._id}`} style={{ marginLeft: "25px" }}>
                                  <IconText
                                    type="message"
                                    text={counterFormatter(item.commentCount)}
                                    key="list-vertical-message"
                                  />
                                </Link>
                              )}
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
        </Spin>
      ) : (
        <div>
<div>[List of Patrons](https://github.com/SplitScreen-Me/splitscreenme-patreon).</div>
        </div>
      )}
    </div>
  );
}

export default withRouter(
  withTracker(props => {
    const subscription = Meteor.subscribe("handlers.user", props.match.params.id);
    const subscriptionUser = Meteor.subscribe("users.getProfile", props.match.params.id);
    const subscriptionUserSearch = Meteor.subscribe("users.searchProfile", currentSearch.get());
    const user = Meteor.user();
    return {
      loading: !subscription.ready() || !subscriptionUser.ready(),
      user,
      handlers: HandlersCollection.find(
        { owner: props.match.params.id },
        {
          sort: { createdAt: -1 }
        }
      ).fetch(),
      users: Meteor.users
        .find(
          {
            "profile.username": {
              $regex: new RegExp(escapeRegExp(currentSearch.get())),
              $options: "gi"
            }
          },
          {
            limit: 10
          }
        )
        .fetch(),
      userProfile: Meteor.users.findOne(props.match.params.id)
    };
  })(UserHandlers)
);
