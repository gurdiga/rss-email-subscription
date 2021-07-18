import nodemailer from 'nodemailer';
import { requireEnvVar, requireNumericEnvVar } from '../shared/env';

export type DeliverEmailFn = (address: string, subject: string, body: string) => Promise<void>;

let transporter: ReturnType<typeof nodemailer.createTransport>;

export async function deliverEmail(address: string, subject: string, htmlBody: string): Promise<void> {
  if (!transporter) {
    transporter = nodemailer.createTransport(requireEnvVar('SMTP_CONNECTION_STRING'));
  }

  await transporter.sendMail({
    from: requireEnvVar('FROM_EMAIL_ADDRESS'),
    to: address,
    subject,
    text: 'Please use an HTML-capable email reader',
    html: htmlBody,
  });
}
