import { Result, isString, makeErr } from '../shared/lang';

export type DeliveryStatus = PostfixDeliveryStatus | SyntheticDeliveryStatus;

export enum PrePostfixMessageStatus {
  Prepared = 'prepared',
  Postfixed = 'postfixed',
}

export enum PostfixDeliveryStatus {
  Sent = 'sent',
  Bounced = 'bounced',
  Deferred = 'deferred',
}

export enum SyntheticDeliveryStatus {
  MailboxFull = 'mailbox-full',
}

export function isPostfixDeliveryStatus(value: unknown): value is PostfixDeliveryStatus {
  return Object.values(PostfixDeliveryStatus).includes(value as any);
}

export type StoredEmailStatus = PrePostfixMessageStatus | DeliveryStatus;
function isStoredEmailStatus(value: unknown): value is StoredEmailStatus {
  const validValue = [PrePostfixMessageStatus, PostfixDeliveryStatus].flatMap((x) => Object.values(x));

  return validValue.includes(value);
}

export function makeStoredEmailStatus(value: unknown, field = 'status'): Result<StoredEmailStatus> {
  if (!isString(value)) {
    return makeErr('Not a string', field);
  }

  if (!isStoredEmailStatus(value)) {
    return makeErr('Invalid status', field);
  }

  return value;
}
