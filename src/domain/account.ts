import { Err, getTypeName, hasKind, isString, makeErr, Result } from '../shared/lang';
import { si } from '../shared/string-utils';
import { ConfirmationSecret } from './confirmation-secrets';
import { EmailAddress } from './email-address';
import { HashedPassword } from './hashed-password';
import { Password } from './password';
import { PaddleCustomerId } from './payment';
import { PlanId } from './plan';

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
  planId: PlanId;
  email: EmailAddress;
  // Chosen on the confirmation page, not at registration: only whoever controls the
  // mailbox gets to set it. Undefined until then.
  hashedPassword: HashedPassword | undefined;
  creationTimestamp: Date;
  confirmationTimestamp: Date | undefined;
  isAdmin: boolean;
  passwordChangedAt: Date;
  paddleCustomerId: PaddleCustomerId | undefined;
  lastPaddlePlanEventAt: Date | undefined;
}

export interface AccountData {
  planId: string;
  email: string;
  hashedPassword?: string;
  creationTimestamp: Date;
  confirmationTimestamp: Date | undefined;
  isAdmin: boolean | undefined;
  passwordChangedAt: Date | undefined;
  paddleCustomerId?: string;
  lastPaddlePlanEventAt?: Date;
}

export interface UiAccount {
  email: string;
  planId: PlanId;
  isAdmin: boolean;
  cardDescription: string;
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
  planId: PlanId;
  email: EmailAddress;
}

export type RegistrationRequestData = Record<keyof RegistrationRequest, string>;

export interface RegistrationResponseData {
  paymentToken: string;
}

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
  password: Password;
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

export interface PlanChangeRequest {
  planId: PlanId;
}

export type PlanChangeRequestData = Record<keyof PlanChangeRequest, string>;

export interface PlanChangeResponseData {
  paymentToken: string;
}

export interface DeleteAccountRequest {
  password: Password;
}

export type DeleteAccountRequestData = Record<keyof DeleteAccountRequest, string>;
