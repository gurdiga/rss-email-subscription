import { Err, getTypeName, hasKind, isString, makeErr, Result } from '../shared/lang';
import { si } from '../shared/string-utils';
import { ConfirmationSecret } from './confirmation-secrets';
import { EmailAddress } from './email-address';
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

export interface EmailChangeConfirmationRequest {
  secret: ConfirmationSecret;
}

export type EmailChangeConfirmationRequestData = Record<keyof EmailChangeConfirmationRequest, string>;
