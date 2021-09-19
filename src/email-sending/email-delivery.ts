import nodemailer from 'nodemailer';
import Mail from 'nodemailer/lib/mailer';
import { FullEmailAddress } from './emails';
import { textFromHtml } from './item-sending';

export interface EmailDeliveryEnv {
  SMTP_CONNECTION_STRING: string;
}

export type DeliverEmailFn = (
  from: FullEmailAddress,
  to: string,
  replyTo: string,
  subject: string,
  textBody: string,
  htmlBody: string,
  env: EmailDeliveryEnv
) => Promise<void>;

let transporter: ReturnType<typeof nodemailer.createTransport>;

export async function deliverEmail(
  from: FullEmailAddress,
  to: string,
  replyTo: string,
  subject: string,
  textBody: string,
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
    text: textBody,
    html: htmlBody,
  });
}

function makeMailAddress(fullEmailAddress: FullEmailAddress): Mail.Address {
  return {
    name: fullEmailAddress.displayName,
    address: fullEmailAddress.emailAddress.value,
  };
}
