import { Err, getTypeName, hasKind, isErr, isObject, isString, makeErr, Result } from '../shared/lang';
import { si } from '../shared/string-utils';
import { ConfirmationSecret, makeConfirmationSecret } from './confirmation-secrets';
import { EmailAddress } from './email-address';
import { makeEmailAddress } from './email-address-making';
import { HashedPassword } from './hashed-password';
import { Password } from './password';

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
  hashedPassword: HashedPassword;
  creationTimestamp: Date;
  confirmationTimestamp: Date | undefined;
}

export interface AccountData {
  email: string;
  hashedPassword: string;
  creationTimestamp: Date;
  confirmationTimestamp: Date | undefined;
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

export interface RegistrationRequest {
  email: EmailAddress;
  password: Password;
}

export type RegistrationRequestData = Record<keyof RegistrationRequest, string>;

export interface AuthenticationRequest {
  email: EmailAddress;
  password: Password;
}

export type AuthenticationRequestData = Record<keyof AuthenticationRequest, string>;

export interface AuthenticationResponseData {
  sessionId: string;
}

export interface RegistrationConfirmationRequest {
  secret: string;
}

export type RegistrationConfirmationRequestData = Record<keyof RegistrationConfirmationRequest, string>;

export type EmailChangeRequestData = Record<keyof EmailChangeRequest, string>;

export interface EmailChangeRequest {
  newEmail: EmailAddress;
}

export function makeEmailChangeRequest(data: unknown | EmailChangeRequestData): Result<EmailChangeRequest> {
  if (!isObject(data)) {
    return makeErr(si`Invalid request data type: expected [object] but got [${getTypeName(data)}]`);
  }

  const keyName: keyof EmailChangeRequestData = 'newEmail';

  if (!(keyName in data)) {
    return makeErr(si`Invalid request: missing "${keyName}" prop`, keyName);
  }

  const newEmail = makeEmailAddress(data.newEmail, keyName);

  if (isErr(newEmail)) {
    return newEmail;
  }

  return { newEmail };
}

export interface EmailChangeConfirmationRequest {
  secret: ConfirmationSecret;
}

export function makeEmailChangeConfirmationRequest(
  data: unknown | EmailChangeConfirmationRequestData
): Result<EmailChangeConfirmationRequest> {
  if (!isObject(data)) {
    return makeErr(si`Invalid request data type: expected [object] but got [${getTypeName(data)}]`);
  }

  const keyName: keyof EmailChangeConfirmationRequestData = 'secret';

  if (!(keyName in data)) {
    return makeErr(si`Invalid request: missing "${keyName}"`, keyName);
  }

  const secret = makeConfirmationSecret(data.secret);

  if (isErr(secret)) {
    return makeErr(si`Invalid request "${keyName}": ${secret.reason}`, keyName);
  }

  return { secret };
}

export type EmailChangeConfirmationRequestData = Record<keyof EmailChangeConfirmationRequest, string>;
