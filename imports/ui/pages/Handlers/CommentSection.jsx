import React, { useState } from 'react';
import { withTracker } from 'meteor/react-meteor-data';
import { Session } from 'meteor/session';
import {
  Col,
  Row,
  Spin,
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
  const [myReply, setMyReply] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState('');

  const isAdmin = props.user && Roles.userIsInRole(props.user._id, ['admin_enabled']);

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
    message.success('Comment reported');
  };

  const handleChange = e => {
    setMyComment(e.target.value);
  };

  const handleSubmit = (replyTo = "") => {
    if (replyTo.length === 0 && !myComment) {
      return;
    }
    if(replyTo.length > 0 && !myReply) {
      return;
    }
    setIsSending(true);
    const sentComment = { handlerId: props.handlerId };
    if(replyTo.length > 0) {
      sentComment.replyTo = replyTo;
      sentComment.content = myReply;
    }else {
      delete sentComment.replyTo;
      sentComment.content = myComment;
    }

    Meteor.call('comments.insert', sentComment, (error, result) => {
      if (error) {
        notification.error(error);
        setIsSending(false);
      } else {
        setIsSending(false);
        setMyComment('');
        setReplyingTo('');
        setMyReply('');
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

          <a onClick={() => {
            if(!Meteor.user()) {
              Session.set('loginModal', true);
            } else {
              setReplyingTo(comment._id);
            }
          }}>Reply         </a>
        {(comment.owner === Meteor.userId() || isAdmin) &&
        <Popconfirm
          title="Are you sure you want to delete your comment ?"
          onConfirm={confirmDeleteComment(comment._id)}
          okText="Yes"
          cancelText="No"
        >
          <a href="#">Delete   </a>
        </Popconfirm>
        }
        {(Meteor.userId() && comment.owner !== Meteor.userId()) &&
            <Popconfirm
              title="Are you sure you want to report this comment ?"
              onConfirm={confirmReportComment}
              okText="Yes"
              cancelText="No"
            >
              <a href="#">Report</a>
            </Popconfirm>
          }
      </div>,
    ],
    author: comment.ownerName,
    authorId: comment.owner,
    _id: comment._id,
    avatar: avatars.create(comment.ownerName),
    replies: comment.replies,
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
                  onClick={() => handleSubmit()}
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
                  author={<a href={"../user/" + item.authorId}>{item.author}</a>}
                  avatar={
                    <a href={"../user/" + item.authorId}>
                      <div
                        style={{ width: '35px', height: '35px' }}
                        dangerouslySetInnerHTML={{ __html: item.avatar }}
                      />
                    </a>
                  }
                  content={item.content}
                  datetime={item.datetime}
                >
                  {item.replies?.length > 0 && item.replies.map(reply => (
                    <Comment
                      key={reply._id}
                      actions={[<div key="comment-list-report" style={{ fontSize: '10px' }}>
                        {(reply.owner === Meteor.userId() || isAdmin) &&
                          <Popconfirm
                            title="Are you sure you want to delete your comment ?"
                            onConfirm={confirmDeleteComment(reply._id)}
                            okText="Yes"
                            cancelText="No"
                          >
                            <a href="#">Delete </a>
                          </Popconfirm>
                        }
                        {(Meteor.userId() && reply.owner !== Meteor.userId()) &&
                          <Popconfirm
                            title="Are you sure you want to report this comment ?"
                            onConfirm={confirmReportComment}
                            okText="Yes"
                            cancelText="No"
                          >
                            <a href="#">Report</a>
                          </Popconfirm>
                        }
                      </div>]}
                      author={<a href={'../user/' + reply.owner}>{reply.ownerName}</a>}
                      avatar={
                        <a href={'../user/' + reply.owner}>
                          <div
                            style={{ width: '35px', height: '35px' }}
                            dangerouslySetInnerHTML={{ __html: avatars.create(reply.ownerName) }}
                          />
                        </a>
                      }
                      content={reply.content}
                      datetime={<Tooltip title={<Moment format="YYYY-MM-DD HH:mm">{reply.createdAt}</Moment>}>
        <span>
          <Moment fromNow>{reply.createdAt}</Moment>
        </span>
                      </Tooltip>}
                    />
                  ))}
                  {replyingTo === item._id && (
                    <React.Fragment>
                      <Form.Item>
                        <TextArea rows={4} onChange={(e) => setMyReply(e.target.value)} value={myReply} />
                      </Form.Item>
                      <Form.Item>
                        <Button
                          htmlType="submit"
                          loading={isSending}
                          disabled={myReply.length > 800}
                          onClick={() => handleSubmit(item._id)}
                          type="primary"
                        >
                          Add Reply ({myReply.length}/800)
                        </Button>
                        {"    "}
                        <Button
                          htmlType="submit"
                          onClick={() => setReplyingTo("")}
                        >
                          Cancel
                        </Button>
                      </Form.Item>
                    </React.Fragment>
                  )}
                </Comment>
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
    ).fetch().map(comment => ({...comment, replies: Comments.find({ handlerId: props.handlerId, replyTo: comment._id },{
        sort: { createdAt: 1 },
      }).fetch()})).filter(comment => !comment.replyTo)
  };
})(CommentSection);
