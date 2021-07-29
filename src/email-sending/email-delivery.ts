import nodemailer from 'nodemailer';

export interface EmailDeliveryEnv {
  SMTP_CONNECTION_STRING: string;
  FROM_EMAIL_ADDRESS: string;
}

export type DeliverEmailFn = (address: string, subject: string, body: string, env: EmailDeliveryEnv) => Promise<void>;

let transporter: ReturnType<typeof nodemailer.createTransport>;

export async function deliverEmail(
  address: string,
  subject: string,
  htmlBody: string,
  env: EmailDeliveryEnv
): Promise<void> {
  if (!transporter) {
    transporter = nodemailer.createTransport(env.SMTP_CONNECTION_STRING);
  }

  await transporter.sendMail({
    from: env.FROM_EMAIL_ADDRESS, // TODO: Move to feed.json
    to: address,
    subject,
    text: 'Please use an HTML-capable email reader',
    html: htmlBody,
  });
}
