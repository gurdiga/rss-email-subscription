import { Err, getTypeName, hasKind, isErr, isObject, isString, makeErr, Result } from '../shared/lang';
import { si } from '../shared/string-utils';
import { EmailAddress } from './email-address';
import { makeEmailAddress } from './email-address-making';
import { HashedPassword } from './hashed-password';

export interface AccountId {
  kind: 'AccountId';
  value: string;
}

export function makeAccountId(value: string): Result<AccountId> {
  if (!isString(value)) {
    return makeErr(si`Not a string: ${getTypeName(value)} "${value}"`);
  }

  return {
    kind: 'AccountId',
    value,
  };
}

export function isAccountId(value: unknown): value is AccountId {
  return hasKind(value, 'AccountId');
}

export interface Account {
  email: EmailAddress;
  newUnconfirmedEmail?: EmailAddress;
  hashedPassword: HashedPassword;
  creationTimestamp: Date;
  confirmationTimestamp?: Date;
}

export interface AccountData {
  email: string;
  hashedPassword: string;
  creationTimestamp: Date;
  confirmationTimestamp?: Date;
  feedIds?: string[];
}

export interface UiAccount {
  email: string;
}

export interface AccountNotFound {
  kind: 'AccountNotFound';
}

export function makeAccountNotFound(): AccountNotFound {
  return { kind: 'AccountNotFound' };
}

export function isAccountNotFound(value: unknown): value is AccountNotFound {
  return hasKind(value, 'AccountNotFound');
}

export interface AccountIdList {
  accountIds: AccountId[];
  errs: Err[];
}

export type EmailChangeRequestData = Record<keyof EmailChangeRequest, string>;

function isEmailChangeRequestData(value: unknown): value is EmailChangeRequestData {
  if (!isObject(value)) {
    return false;
  }

  const keyName: keyof EmailChangeRequestData = 'newEmail';

  if (!(keyName in value)) {
    return false;
  }

  if (typeof value[keyName] !== 'string') {
    return false;
  }

  return true;
}

export interface EmailChangeRequest {
  newEmail: EmailAddress;
}

export function makeEmailChangeRequest(data: unknown | EmailChangeRequestData): Result<EmailChangeRequest> {
  if (!isEmailChangeRequestData(data)) {
    return makeErr('Invalid email change request');
  }

  const newEmail = makeEmailAddress(data.newEmail, 'newEmail' as keyof EmailChangeRequestData);

  if (isErr(newEmail)) {
    return newEmail;
  }

  return { newEmail };
}

export interface EmailChangeResponse {
  newEmail: string;
}
