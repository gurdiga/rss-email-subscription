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
  body: string,
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
    html: htmlBody,
  });
}

function makeMailAddress(fullEmailAddress: FullEmailAddress): Mail.Address {
  return {
    name: fullEmailAddress.displayName,
    address: fullEmailAddress.emailAddress.value,
  };
}
