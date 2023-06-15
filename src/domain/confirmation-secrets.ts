import { getTypeName, hasKind, makeErr, Result } from '../shared/lang';
import { si } from '../shared/string-utils';
import { AccountId } from './account';
import { EmailAddress } from './email-address';

export interface ConfirmationSecret {
  kind: 'ConfirmationSecret';
  value: string;
}

export const confirmationSecretLength = 64;

export function isConfirmationSecret(value: unknown): value is ConfirmationSecret {
  return hasKind(value, 'ConfirmationSecret');
}

export function makeConfirmationSecret(input: unknown, field = 'secret'): Result<ConfirmationSecret> {
  if (!input) {
    return makeErr('Empty input', field);
  }

  if (typeof input !== 'string') {
    return makeErr(si`Input of invalid type: ${getTypeName(input)}`, field);
  }

  if (input.length !== confirmationSecretLength) {
    return makeErr(si`Input of invalid length; expected ${confirmationSecretLength}`, field);
  }

  return {
    kind: 'ConfirmationSecret',
    value: input,
  };
}

export interface ConfirmationSecretNotFound {
  kind: 'ConfirmationSecretNotFound';
  secret: ConfirmationSecret;
}

export function isConfirmationSecretNotFound(value: unknown): value is ConfirmationSecretNotFound {
  return hasKind(value, 'ConfirmationSecretNotFound');
}

export function makeConfirmationSecretNotFound(secret: ConfirmationSecret): ConfirmationSecretNotFound {
  return {
    kind: 'ConfirmationSecretNotFound',
    secret,
  };
}

export interface EmailChangeRequestSecretData {
  kind: 'EmailChangeRequestSecretData';
  accountId: AccountId;
  newEmail: EmailAddress;
  timestamp: Date;
}

export function makeEmailChangeRequestSecretData(
  accountId: AccountId,
  newEmail: EmailAddress
): EmailChangeRequestSecretData {
  return {
    kind: 'EmailChangeRequestSecretData',
    accountId,
    newEmail,
    timestamp: new Date(),
  };
}
