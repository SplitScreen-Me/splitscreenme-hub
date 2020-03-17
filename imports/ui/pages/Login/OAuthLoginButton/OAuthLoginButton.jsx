import React from 'react';
import styled from 'styled-components';
import { darken } from 'polished';
import { Meteor } from 'meteor/meteor';
import PropTypes from 'prop-types';
import Icon from '../Icon/Icon';

const StyledOAuthLoginButton = styled.button`
  display: block;
  width: 100%;
  padding: 10px 15px;
  border: none;
  background: #eee;
  border-radius: 3px;

  i {
    margin-right: 3px;
    font-size: 18px;
    position: relative;
    top: 1px;
  }

  &.OAuthLoginButton-facebook {
    background: #3b5998;
    color: #fff;
    cursor: pointer;
    &:hover {
      background: ${darken(0.05, '#3b5998')};
    }
  }

  &.OAuthLoginButton-google {
    background: #ea4335;
    color: #fff;
    cursor: pointer;
    &:hover {
      background: ${darken(0.05, '#ea4335')};
    }
  }

  &.OAuthLoginButton-github {
    background: #333;
    color: #fff;
    cursor: pointer;
    &:hover {
      background: ${darken(0.05, '#333333')};
    }
  }

  &.OAuthLoginButton-discord {
    background: #7289da;
    color: #fff;
    cursor: pointer;
    &:hover {
      background: ${darken(0.05, '#7289da')};
    }
  }

  &:active {
    position: relative;
    top: 1px;
  }

  &:active,
  &:focus {
    outline: 0;
  }

  &:not(:last-child) {
    margin-top: 10px;
  }
`;

const handleLogin = (service, callback) => {
  const options = {
    facebook: {
      requestPermissions: ['email'],
      loginStyle: 'popup',
    },
    github: {
      requestPermissions: ['user:email'],
      loginStyle: 'popup',
    },
    google: {
      requestPermissions: ['email', 'profile'],
      requestOfflineToken: true,
      loginStyle: 'popup',
    },
    discord: {
      requestPermissions: ['email', 'identify'],
      loginStyle: 'popup',
    },
  }[service];

  return {
    facebook: Meteor.loginWithFacebook,
    github: Meteor.loginWithGithub,
    google: Meteor.loginWithGoogle,
    discord: Meteor.loginWithDiscord,
  }[service](options, callback);
};

const serviceLabel = {
  facebook: (
    <span>
      <Icon iconStyle="brand" icon="facebook" /> Log In with Facebook
    </span>
  ),
  github: (
    <span>
      <Icon iconStyle="brand" icon="github" /> Log In with GitHub
    </span>
  ),
  google: (
    <span>
      <Icon iconStyle="brand" icon="google" /> Log In with Google
    </span>
  ),
  discord: (
    <span>
      <Icon iconStyle="brand" icon="discord" /> Log In with Discord
    </span>
  ),
};

const OAuthLoginButton = ({ service, callback }) => (
  <StyledOAuthLoginButton
    className={`OAuthLoginButton OAuthLoginButton-${service}`}
    type="button"
    onClick={() => handleLogin(service, callback)}
  >
    {serviceLabel[service]}
  </StyledOAuthLoginButton>
);

OAuthLoginButton.defaultProps = {
  callback: error => {
    if (error) console.log(error.message);
  },
};

OAuthLoginButton.propTypes = {
  service: PropTypes.string.isRequired,
  callback: PropTypes.func,
};
export default OAuthLoginButton;
