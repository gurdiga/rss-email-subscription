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

export function makeAccountId(value: string, field = 'accountId'): Result<AccountId> {
  if (!isString(value)) {
    return makeErr(si`Not a string: ${getTypeName(value)} "${value}"`, field);
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
  secret: ConfirmationSecret;
}

export type RegistrationConfirmationRequestData = Record<keyof RegistrationConfirmationRequest, string>;

export interface EmailChangeRequest {
  newEmail: EmailAddress;
}

export type EmailChangeRequestData = Record<keyof EmailChangeRequest, string>;

export interface EmailChangeConfirmationRequest {
  secret: ConfirmationSecret;
}

export type EmailChangeConfirmationRequestData = Record<keyof EmailChangeConfirmationRequest, string>;

export interface PasswordChangeRequest {
  currentPassword: Password;
  newPassword: Password;
}

export type PasswordChangeRequestData = Record<keyof PasswordChangeRequest, string>;

export interface PasswordChangeConfirmationRequest {}

export type PasswordChangeConfirmationRequestData = Record<keyof PasswordChangeConfirmationRequest, string>;
