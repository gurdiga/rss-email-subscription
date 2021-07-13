import nodemailer from 'nodemailer';
import { requireEnvVar, requireNumericEnvVar } from '../shared/env';

export type DeliverEmailFn = (address: string, subject: string, body: string) => Promise<void>;

let transporter: ReturnType<typeof nodemailer.createTransport>;

export async function deliverEmail(address: string, subject: string, htmlBody: string): Promise<void> {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: requireEnvVar('SMTP_HOST'),
      port: requireNumericEnvVar('SMTP_PORT'),
      secure: false, // upgrade later with STARTTLS
      auth: {
        user: requireEnvVar('SMTP_USER'),
        pass: requireEnvVar('SMTP_PASSWORD'),
      },
    });
  }

  await transporter.sendMail({
    from: requireEnvVar('FROM_EMAIL_ADDRESS'),
    to: address,
    subject,
    text: 'Please use an HTML-capable email',
    html: htmlBody,
  });
}
