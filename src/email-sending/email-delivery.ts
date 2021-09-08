import nodemailer from 'nodemailer';

export interface EmailDeliveryEnv {
  SMTP_CONNECTION_STRING: string;
}

export type DeliverEmailFn = (
  from: string,
  to: string,
  replyTo: string,
  subject: string,
  body: string,
  env: EmailDeliveryEnv
) => Promise<void>;

let transporter: ReturnType<typeof nodemailer.createTransport>;

export async function deliverEmail(
  from: string,
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
    from,
    to,
    replyTo,
    subject,
    text: 'Please use an HTML-capable email reader',
    html: htmlBody,
  });
}
