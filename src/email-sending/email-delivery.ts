import nodemailer from 'nodemailer';
import { requireEnvVar } from '../shared/env';

export type DeliverEmailFn = (address: string, subject: string, body: string) => Promise<void>;

let transporter: ReturnType<typeof nodemailer.createTransport>;

// TODO: Have an Env for every main to make it clear what envars it needs.
const smtpConnectionString = requireEnvVar('SMTP_CONNECTION_STRING');
const fromEmailAddressString = requireEnvVar('FROM_EMAIL_ADDRESS'); // make it an arg: senderAddress

export async function deliverEmail(address: string, subject: string, htmlBody: string): Promise<void> {
  if (!transporter) {
    transporter = nodemailer.createTransport(smtpConnectionString);
  }

  await transporter.sendMail({
    from: fromEmailAddressString,
    to: address,
    subject,
    text: 'Please use an HTML-capable email reader',
    html: htmlBody,
  });
}
