import nodemailer, { Transporter } from 'nodemailer';
import Mail from 'nodemailer/lib/mailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import { DOMAIN_NAME } from '../../domain/feed-settings';
import { FullEmailAddress } from './emails';

export interface EmailDeliveryEnv {
  SMTP_CONNECTION_STRING: string;
}

export type DeliverEmailFn = (emailDeliveryRequest: EmailDeliveryRequest) => Promise<DeliveryInfo>;

let transporter: Transporter<SMTPTransport.SentMessageInfo>;
const SOCKET_TIMEOUT_MS = 5000;

export interface EmailDeliveryRequest {
  from: FullEmailAddress;
  to: string;
  replyTo: string;
  subject: string;
  htmlBody: string;
  env: EmailDeliveryEnv;
}

export async function deliverEmail({
  from,
  to,
  replyTo,
  subject,
  htmlBody,
  env,
}: EmailDeliveryRequest): Promise<DeliveryInfo> {
  if (!transporter) {
    transporter = nodemailer.createTransport(env.SMTP_CONNECTION_STRING, { socketTimeout: SOCKET_TIMEOUT_MS });
  }

  const messageInfo = await transporter.sendMail({
    from: makeMailAddress(from),
    to,
    replyTo,
    subject,
    html: htmlBody,
    envelope: {
      from: makeReturnPath(to),
      to,
    },
  });

  return {
    messageId: messageInfo.messageId,
    envelopeFrom: messageInfo.envelope.from || '[EMPTY envelope.from]',
    messageTime: (messageInfo as any).messageTime,
    messageSize: (messageInfo as any).messageSize,
    response: messageInfo.response,
  };
}

export interface DeliveryInfo {
  messageId: string;
  envelopeFrom: string;
  messageTime: number;
  messageSize: number;
  response: string;
}

function makeMailAddress(fullEmailAddress: FullEmailAddress): Mail.Address {
  return {
    name: fullEmailAddress.displayName,
    address: fullEmailAddress.emailAddress.value,
  };
}

export function makeReturnPath(to: string, timestamp = Date.now().toString()): string {
  const toAddress = to.replace(/@/, '=');

  return `bounced-${timestamp}-${toAddress}@${DOMAIN_NAME}`;
}
