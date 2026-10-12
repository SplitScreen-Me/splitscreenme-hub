import type { MailMessage } from '@/lib/mail';

/**
 * Plain-text emails. Links carry tokens in the fragment (`#token=`), which browsers never send to a
 * server or in a Referer. Nothing personal beyond the username.
 */

const SIGNATURE = '\n\n-- \nSplitScreen.Me\nYou receive this email because of an action on your account.';

export function verifyEmailMessage(to: string, username: string, link: string): MailMessage {
  return {
    to,
    subject: 'Confirm your email address',
    text:
      `Hi ${username},\n\nConfirm your email address for SplitScreen.Me by opening this link ` +
      `(valid 48 hours):\n\n${link}\n\nIf you did not create an account, ignore this email.${SIGNATURE}`,
  };
}

export function changeEmailMessage(to: string, username: string, link: string): MailMessage {
  return {
    to,
    subject: 'Confirm your new email address',
    text:
      `Hi ${username},\n\nYou asked to use this address for your SplitScreen.Me account. Confirm it by opening ` +
      `this link (valid 48 hours):\n\n${link}\n\nIf this was not you, ignore this email: nothing changes.${SIGNATURE}`,
  };
}

export function resetPasswordMessage(to: string, username: string, link: string): MailMessage {
  return {
    to,
    subject: 'Reset your password',
    text:
      `Hi ${username},\n\nSomeone (hopefully you) asked to reset the password of your SplitScreen.Me account. ` +
      `Choose a new one with this link (valid 1 hour, single use):\n\n${link}\n\n` +
      `If this was not you, ignore this email: your password does not change.${SIGNATURE}`,
  };
}

export function replyNotificationMessage(
  to: string,
  username: string,
  replier: string,
  handlerTitle: string,
  link: string,
): MailMessage {
  return {
    to,
    subject: `${replier} replied to your comment`,
    text:
      `Hi ${username},\n\n${replier} replied to your comment on "${handlerTitle}":\n\n${link}\n\n` +
      `You can turn these emails off on your account page.${SIGNATURE}`,
  };
}
