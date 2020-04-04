import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';
import { Accounts } from 'meteor/accounts-base';
import { Roles } from 'meteor/alanning:roles';
import editProfile from './edit-profile';
import deleteAccount from './delete-account';
import sendWelcomeEmail from './send-welcome-email';
import handleMethodException from '../../../modules/handle-method-exception';
import rateLimit from '../../../modules/rate-limit';
import {d_aLog} from '../../../modules/server/discord-logging';

Meteor.methods({
  'users.sendVerificationEmail': function usersSendVerificationEmail() {
    console.log('sending verif mail');
    return Accounts.sendVerificationEmail(this.userId);
  },
  'users.sendWelcomeEmail': function userSendWelcomeEmail() {
    console.log('sending welcome');
    return sendWelcomeEmail()
      .then(response => response)
      .catch(exception => {
        handleMethodException(exception);
      });
  },
  'users.fetchSettings': function usersFetchSettings(options) {
    // eslint-disable-line
    check(options, Match.Maybe(Object));

    try {
      const user = Meteor.users.findOne(
        { _id: options.userId || this.userId },
        { fields: { settings: 1 } },
      );

      if (user && user.settings) {
        if (!options.gdpr && !options.isAdmin) {
          return user.settings;
        }
        if (options.gdpr && !options.isAdmin) {
          return user.settings.filter(setting => setting.isGDPR === true);
        }
        if (options.isAdmin) {
          return user.settings.filter(
            setting => setting.isGDPR === false || typeof setting.isGDPR === 'undefined',
          );
        }
      }

      return [];
    } catch (exception) {
      console.warn(exception);
      handleMethodException(exception);
    }
  },
  'users.checkIfGDPRComplete': function usersCheckIfGDPRComplete() {
    // eslint-disable-line
    try {
      let gdprComplete = true;
      const user = Meteor.users.findOne({ _id: this.userId }, { fields: { settings: 1 } });
      const gdprSettings = user.settings.filter(setting => setting.isGDPR === true);
      gdprSettings.forEach(({ lastUpdatedByUser }) => {
        if (!lastUpdatedByUser) {
          gdprComplete = false;
        }
      });
      return gdprComplete;
    } catch (exception) {
      handleMethodException(exception);
    }
  },
  'users.saveGDPRSettings': function usersSaveGDPRSettings() {
    // eslint-disable-line
    try {
      const user = Meteor.users.findOne({ _id: this.userId }, { fields: { _id: 1, settings: 1 } });
      user.settings = user.settings
        .filter(setting => setting.isGDPR === true)
        .map(gdprSetting => ({
          ...gdprSetting,
          lastUpdatedByUser: new Date().toISOString(),
        }));
      return Meteor.users.update({ _id: user._id }, { $set: { settings: user.settings } });
    } catch (exception) {
      handleMethodException(exception);
    }
  },
  'users.updateSetting': function usersUpdateSetting(setting) {
    // eslint-disable-line
    check(setting, Object);

    try {
      const user = Meteor.users.findOne({ _id: setting.userId || this.userId });
      const settingToUpdate = user.settings.find(({ _id }) => _id === setting._id);

      if (setting.userId && Roles.userIsInRole(this.userId, 'admin')) {
        settingToUpdate.value = setting.value;
        settingToUpdate.lastUpdatedByAdmin = new Date().toISOString();
      }

      if (!setting.userId && user._id === this.userId) {
        settingToUpdate.value = setting.value;
        settingToUpdate.lastUpdatedByUser = new Date().toISOString();
      }

      return Meteor.users.update(
        { _id: setting.userId || this.userId },
        { $set: { settings: user.settings } },
      );
    } catch (exception) {
      handleMethodException(exception);
    }
  },
  'users.editProfile': function usersEditProfile(profile) {
    check(profile, {
      emailAddress: String,
      profile: {
        name: {
          first: String,
          last: String,
        },
      },
    });

    return editProfile({ userId: this.userId, profile })
      .then(response => response)
      .catch(exception => {
        handleMethodException(exception);
      });
  },
  'users.exportData': function usersExportData() {
    return exportData({ userId: this.userId })
      .then(response => response)
      .catch(exception => {
        handleMethodException(exception);
      });
  },
  'users.deleteAccount': function usersDeleteAccount(userId) {
    check(userId, Match.Maybe(String));
    if (userId && !Roles.userIsInRole(this.userId, 'admin')) {
      throw new Meteor.Error('403', 'Sorry, you need to be an administrator to do this.');
    }
    return deleteAccount({ userId: userId || this.userId })
      .then(response => response)
      .catch(exception => {
        handleMethodException(exception);
      });
  },
  'users.adminEnable': function usersAdminEnable() {
    if (!Roles.userIsInRole(this.userId, 'admin')) {
      throw new Meteor.Error('403', 'Sorry, you need to be an administrator to do this.');
    }
    if(Roles.userIsInRole(this.userId, 'admin_enabled')){
      Roles.removeUsersFromRoles(this.userId, 'admin_enabled');
      d_aLog("Log out", `${Meteor.user().profile.username} turned off admin mode.`);
      return "disabled";
    }else{
      Roles.addUsersToRoles(this.userId, 'admin_enabled');
      d_aLog("Log in", `${Meteor.user().profile.username} turned on admin mode.`);
      return "enabled";
    }
  }
});

rateLimit({
  methods: [
    'users.sendVerificationEmail',
    'users.sendWelcomeEmail',
    'users.fetchSettings',
    'users.checkIfGDPRComplete',
    'users.saveGDPRSettings',
    'users.updateSetting',
    'users.editProfile',
    'users.exportData',
    'users.deleteAccount',
    'users.adminEnable',
  ],
  limit: 5,
  timeRange: 1000,
});
