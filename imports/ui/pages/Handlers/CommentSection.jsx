import React, { useState } from 'react';
import { withTracker } from 'meteor/react-meteor-data';
import {
  Col,
  Row,
  Spin,
  Timeline,
  Comment,
  Tooltip,
  List,
  Form,
  Button,
  Input,
  notification,
  Popconfirm,
  message,
} from 'antd';
import Comments from '../../../api/Comments/Comments';
import Moment from 'react-moment';
import Avatars from '@dicebear/avatars';
import sprites from '@dicebear/avatars-gridy-sprites';

let avatars = new Avatars(sprites({}));
const { TextArea } = Input;

function CommentSection(props) {
  const [myComment, setMyComment] = useState('');
  const [isSending, setIsSending] = useState(false);

  const confirmDeleteComment = commentId => e => {
    Meteor.call('comments.remove', commentId, (error, result) => {
      if (error) {
        notification.error(error);
      } else {
        message.success('Comment deleted');
      }
    });
  };
  const confirmReportComment = e => {
    console.log(e);
    message.success('Comment deleted');
  };

  const handleChange = e => {
    setMyComment(e.target.value);
  };

  const handleSubmit = () => {
    if (!myComment) {
      return;
    }
    setIsSending(true);
    const sentComment = { content: myComment, handlerId: props.handlerId };
    console.log(sentComment);
    Meteor.call('comments.insert', sentComment, (error, result) => {
      if (error) {
        notification.error(error);
        setIsSending(false);
      } else {
        setIsSending(false);
        setMyComment('');
        notification.success({
          message: 'New comment',
          description: `Your comment has been published !`,
        });
      }
    });
  };

  const data = props.comments.map((comment, index) => ({
    actions: [
      <div key="comment-list-report" style={{ fontSize: '10px' }}>
        {Meteor.userId() &&
          (comment.owner === Meteor.userId() ? (
            <Popconfirm
              title="Are you sure you want to delete your comment ?"
              onConfirm={confirmDeleteComment(comment._id)}
              okText="Yes"
              cancelText="No"
            >
              <a href="#">Delete</a>
            </Popconfirm>
          ) : (
            <Popconfirm
              title="Are you sure you want to report this comment ?"
              onConfirm={confirmReportComment}
              okText="Yes"
              cancelText="No"
            >
              <a href="#">Delete</a>
            </Popconfirm>
          ))}
      </div>,
    ],
    author: comment.ownerName,
    avatar: avatars.create(comment.ownerName),
    content: <p>{comment.content}</p>,
    datetime: (
      <Tooltip title={<Moment format="YYYY-MM-DD HH:mm">{comment.createdAt}</Moment>}>
        <span>
          <Moment fromNow>{comment.createdAt}</Moment>
        </span>
      </Tooltip>
    ),
  }));
  return (
    <Spin spinning={props.loading}>
      <Row gutter={48}>
        <Col span={24}>
          {props.user ? (
            <React.Fragment>
              <Form.Item>
                <TextArea rows={4} onChange={handleChange} value={myComment} />
              </Form.Item>
              <Form.Item>
                <Button
                  htmlType="submit"
                  loading={isSending}
                  disabled={myComment.length > 800}
                  onClick={handleSubmit}
                  type="primary"
                >
                  Add Comment ({myComment.length}/800)
                </Button>
              </Form.Item>
            </React.Fragment>
          ) : (
            <div style={{ marginLeft: '46px', color: '#CCCCCC' }}>
              You must log in to post comments.
            </div>
          )}
        </Col>
        <Col span={24}>
          <List
            className="comment-list"
            itemLayout="horizontal"
            dataSource={data}
            renderItem={item => (
              <li>
                <Comment
                  actions={item.actions}
                  author={item.author}
                  avatar={
                    <div
                      style={{ width: '35px', height: '35px' }}
                      dangerouslySetInnerHTML={{ __html: item.avatar }}
                    />
                  }
                  content={item.content}
                  datetime={item.datetime}
                />
              </li>
            )}
          />
        </Col>
      </Row>
    </Spin>
  );
}
export default withTracker(props => {
  const subscription = Meteor.subscribe('comments.byHandler', props.handlerId);
  const user = Meteor.user();
  return {
    loading: !subscription.ready(),
    user,
    comments: Comments.find(
      { handlerId: props.handlerId },
      {
        sort: { createdAt: -1 },
      },
    ).fetch(),
  };
})(CommentSection);
