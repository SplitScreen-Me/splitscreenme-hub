import React from 'react';
import { withTracker } from 'meteor/react-meteor-data';
import { Col, Row, Spin } from 'antd';
import { Redirect } from 'react-router';
import LoginForm from '../Login/LoginForm';
import {Packages} from "../../../api/Packages/Packages";
import SyntaxHighlighter from 'react-syntax-highlighter';

function ReadJs(props) {
  return (
    <Spin spinning={props.loading}>
      {props.release[0] && (
        <SyntaxHighlighter showLineNumbers language="javascript">
          {props.release[0].meta.jsContent ? props.release[0].meta.jsContent : 'Loading...'}
        </SyntaxHighlighter>
      )}
    </Spin>
  );
}
export default withTracker(props => {
  const subscription = Meteor.subscribe('packages.view', props.packageId);
  return {
    loading: !subscription.ready(),
    release: Packages.collection.find(props.packageId).fetch(),
  };
})(ReadJs);
