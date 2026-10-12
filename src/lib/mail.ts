import nodemailer, { type Transporter } from 'nodemailer';
import { env, smtpEnabled } from './env';
import { log } from './log';

/**
 * Outgoing mail. SMTP is optional: without SMTP_URL every send is a no-op that returns false, and the
 * UI hides the flows that need email. TLS is always verified: smtps:// (implicit TLS) or smtp:// with
 * STARTTLS required. Templates live in src/lib/mail/templates.
 */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

let transport: Transporter | undefined;

function getTransport(): Transporter {
  if (transport) return transport;
  const url = new URL(env().SMTP_URL!);
  const secure = url.protocol === 'smtps:';
  transport = nodemailer.createTransport({
    host: url.hostname,
    port: url.port ? Number(url.port) : secure ? 465 : 587,
    secure,
    requireTLS: !secure,
    auth: url.username
      ? { user: decodeURIComponent(url.username), pass: decodeURIComponent(url.password) }
      : undefined,
    pool: false,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return transport;
}

export { smtpEnabled as mailEnabled };

/** Sends one message. Returns false when mail is disabled or sending failed (logged without addresses). */
export async function sendMail(message: MailMessage): Promise<boolean> {
  if (!smtpEnabled()) return false;
  try {
    await getTransport().sendMail({ from: env().MAIL_FROM, ...message });
    return true;
  } catch (err) {
    log.error('mail.send_failed', { subject: message.subject, err });
    return false;
  }
}
