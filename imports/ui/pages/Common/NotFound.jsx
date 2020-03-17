import { Link } from 'react-router-dom';
import { Button, Result } from 'antd';
import React from 'react';

function NotFound(props) {
  return (
    <Result
      status="404"
      title="404"
      subTitle="Sorry, this page does not exist."
      extra={
        <Link to="/">
          <Button type="primary">Search handlers</Button>
        </Link>
      }
    />
  );
}
export default NotFound;
