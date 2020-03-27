import React from 'react';
import { withTracker } from 'meteor/react-meteor-data';
import { Spin, Timeline, Row, Col, Typography, Tooltip } from 'antd';
import Packages from "../../../api/Packages/Packages";
import Moment from 'react-moment';

const { Text } = Typography;

function DisplayTimeline(props) {
  return (
    <Spin spinning={props.loading}>
      <Row gutter={48} style={{ margin: '50px' }}>
        <Col span={8}> </Col>
        <Col span={12}>
          <Timeline>
            {props.releases.map((release, index) => (
              <Timeline.Item key={release._id}>
                {release.handlerVersion || release.meta.handlerVersion}. {release.meta.releaseDescription} <br />
                <Text style={{ fontSize: '12px' }} type="secondary">
                  {' '}
                  Released{' '}
                  <Tooltip title={<Moment format="YYYY-MM-DD HH:mm">{release.releaseDate || release.meta.releaseDate}</Moment>}>
                    <Moment fromNow>{release.releaseDate || release.meta.releaseDate}</Moment>
                  </Tooltip>{' '}
                  |{' '}
                  <a
                    href={`/cdn/storage/packages/${
                      release._id
                    }/original/handler-${props.handlerId.toLowerCase()}-v${
                      release.handlerVersion || release.meta.handlerVersion
                    }.nc?download=true`}
                    download={`handler-${props.handlerId.toLowerCase()}-v${
                      release.handlerVersion || release.meta.handlerVersion
                    }.nc`}
                    target="_parent"
                  >
                    Download
                  </a>
                </Text>
              </Timeline.Item>
            ))}
          </Timeline>
        </Col>
      </Row>
    </Spin>
  );
}
export default withTracker(props => {
  const subscription = Meteor.subscribe('packages.viewforhandler', props.handlerId);
  console.log(Packages.findOne());
  return {
    loading: !subscription.ready(),
    releases: Packages.collection
      .find(
        {},
        {
          sort: { handlerVersion: -1, 'meta.handlerVersion': -1 },
        },
      )
      .fetch(),
  };
})(DisplayTimeline);
