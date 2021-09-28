import nodemailer from 'nodemailer';
import Mail from 'nodemailer/lib/mailer';
import { FullEmailAddress } from './emails';

export interface EmailDeliveryEnv {
  SMTP_CONNECTION_STRING: string;
}

export type DeliverEmailFn = (
  from: FullEmailAddress,
  to: string,
  replyTo: string,
  subject: string,
  htmlBody: string,
  env: EmailDeliveryEnv
) => Promise<void>;

let transporter: ReturnType<typeof nodemailer.createTransport>;

export async function deliverEmail(
  from: FullEmailAddress,
  to: string,
  replyTo: string,
  subject: string,
  htmlBody: string,
  env: EmailDeliveryEnv
): Promise<void> {
  if (!transporter) {
    transporter = nodemailer.createTransport(env.SMTP_CONNECTION_STRING);
  }

  await transporter.sendMail({
    from: makeMailAddress(from),
    to,
    replyTo,
    subject,
    text: '',
    html: htmlBody,
    envelope: {
      from: makeReturnPath(to),
    },
  });
}

function makeMailAddress(fullEmailAddress: FullEmailAddress): Mail.Address {
  return {
    name: fullEmailAddress.displayName,
    address: fullEmailAddress.emailAddress.value,
  };
}

// TODO: Maybe take this out to keep this file as thin as possible.
export function makeReturnPath(to: string, timestamp = Date.now().toString()): string {
  const toAddress = to.replace(/@/, '=');

  return `bounced-${timestamp}-${toAddress}@bounces.feedsubscription.com`;
}
