import { getRandomString } from '../shared/crypto';
import { getHoursFromMs } from '../shared/date-utils';
import { getTypeName, hasKind, makeErr, Result } from '../shared/lang';
import { si } from '../shared/string-utils';
import { AccountId } from './account';
import { EmailAddress } from './email-address';

export interface ConfirmationSecret {
  kind: 'ConfirmationSecret';
  value: string;
}

// Applies to every kind of confirmation secret. Registration secrets used to be exempt
// from expiration altogether, which meant the store only ever grew — and every password
// reset request scans all of it.
export const confirmationSecretLifetimeMs = 48 * 3600 * 1000;
export const humanConfirmationSecretLifetime = si`${getHoursFromMs(confirmationSecretLifetimeMs)} hours`;

export const confirmationSecretLength = 64;

// Confirmation secrets are SHA-256 hex digests. The value is used verbatim as a
// filesystem path segment (see getConfirmationSecretStorageKey), so restricting it
// to hex characters prevents path traversal via crafted secrets like "../../settings".
const confirmationSecretCharsetRe = /^[a-f0-9]+$/;

export function isConfirmationSecret(value: unknown): value is ConfirmationSecret {
  return hasKind(value, 'ConfirmationSecret');
}

// Confirmation secrets are opaque, single-use lookup keys into the confirmation-secret
// store; generate them randomly rather than deriving them from the email + global salt,
// so that a leaked salt can't be used to forge a valid link for an arbitrary account.
export function makeRandomConfirmationSecret(): ConfirmationSecret {
  return {
    kind: 'ConfirmationSecret',
    value: getRandomString(confirmationSecretLength),
  };
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

  if (!confirmationSecretCharsetRe.test(input)) {
    return makeErr('Input contains invalid characters', field);
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
