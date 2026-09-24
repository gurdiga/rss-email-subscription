import nodemailer, { Transporter } from 'nodemailer';
import Mail from 'nodemailer/lib/mailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import { si } from '../../shared/string-utils';
import { FullEmailAddress } from './emails';
import { EmailAddress } from '../../domain/email-address';
import { Result, makeErr, getErrorMessage } from '../../shared/lang';
import { EmailContent } from './email-content';

export interface EmailDeliveryEnv {
  SMTP_CONNECTION_STRING: string;
  DOMAIN_NAME: string;
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
    to: toMailAddress(to),
    replyTo: toMailAddress(replyTo),
    subject,
    html: htmlBody,
    envelope: {
      from: makeReturnPath(to, env.DOMAIN_NAME),
      // @types/nodemailer types envelope.to as a plain string, but nodemailer's
      // own address handling (mime-node's _parseEnvelopeAddresses) accepts the
      // same { address } shape as the to field above and, unlike a string,
      // never runs it through the comma/semicolon-splitting addressparser —
      // the type declaration just hasn't caught up with that.
      to: toMailAddress(to) as unknown as string,
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

function toMailAddress(address: string): Mail.Address {
  return { name: '', address };
}

export function makeReturnPath(to: string, domainName: string, uid = Date.now().toString()): string {
  const toAddress = to.replace(/@/, '=');

  return si`bounced-${uid}-${toAddress}@${domainName}`;
}

export async function sendEmail(
  from: FullEmailAddress,
  to: EmailAddress,
  replyTo: EmailAddress,
  emailContent: EmailContent,
  env: EmailDeliveryEnv,
  deliverEmailFn: DeliverEmailFn = deliverEmail
): Promise<Result<DeliveryInfo>> {
  try {
    return await deliverEmailFn({
      from,
      to: to.value,
      replyTo: replyTo.value,
      subject: emailContent.subject,
      htmlBody: emailContent.htmlBody,
      env,
    });
  } catch (error) {
    return makeErr(si`Could not deliver email to ${to.value}: ${getErrorMessage(error)}`);
  }
}
