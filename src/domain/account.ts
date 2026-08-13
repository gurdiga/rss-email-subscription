import { Err, getTypeName, hasKind, isString, makeErr, Result } from '../shared/lang';
import { si } from '../shared/string-utils';
import { ConfirmationSecret } from './confirmation-secrets';
import { EmailAddress } from './email-address';
import { HashedPassword } from './hashed-password';
import { Password } from './password';
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
  hashedPassword: HashedPassword;
  creationTimestamp: Date;
  confirmationTimestamp: Date | undefined;
  // The plan chosen at registration. planId stays PendingPayment until Paddle confirms
  // payment, so without this the choice would be lost between registration and the
  // checkout that now happens after email confirmation.
  requestedPlanId: PlanId | undefined;
  isAdmin: boolean;
}

export interface AccountData {
  planId: string;
  email: string;
  hashedPassword: string;
  creationTimestamp: Date;
  confirmationTimestamp: Date | undefined;
  requestedPlanId: string | undefined;
  isAdmin: boolean | undefined;
}

export interface UiAccount {
  email: string;
  planId: PlanId;
  // What the user picked at registration. planId reads PendingPayment until Paddle pays
  // out, and PendingPayment matches no entry in the plan dropdown, so without this the
  // dropdown would fall back to its first option and forget the choice.
  requestedPlanId: PlanId | undefined;
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
  password: Password;
}

export type RegistrationRequestData = Record<keyof RegistrationRequest, string>;

export interface RegistrationConfirmationResponseData {
  sessionId: string;
  // Both are empty when there is nothing to pay for: a registration predating
  // requestedPlanId, or a checkout that could not be started. The page treats that as
  // "confirmed, no checkout" rather than as a failure.
  paymentToken: string;
  planId: string;
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
