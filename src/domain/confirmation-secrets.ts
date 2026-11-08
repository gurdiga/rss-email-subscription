import { getRandomString } from '../shared/crypto';
import { getHoursFromMs } from '../shared/date-utils';
import { getTypeName, hasKind, makeErr, Result } from '../shared/lang';
import { si } from '../shared/string-utils';
import { Account, AccountId } from './account';
import { EmailAddress } from './email-address';

export interface ConfirmationSecret {
  kind: 'ConfirmationSecret';
  value: string;
}

export type ConfirmationSecretKind =
  | 'RegistrationConfirmationSecretData'
  | 'EmailChangeRequestSecretData'
  | 'PasswordResetConfirmationSecretData';

export const allConfirmationSecretKinds: ConfirmationSecretKind[] = [
  'RegistrationConfirmationSecretData',
  'EmailChangeRequestSecretData',
  'PasswordResetConfirmationSecretData',
];

// The secrets that hand control of an account to whoever holds them, as opposed to
// registration confirmation, which goes to the very address it confirms.
export const accountControlSecretKinds: ConfirmationSecretKind[] = [
  'EmailChangeRequestSecretData',
  'PasswordResetConfirmationSecretData',
];

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

// The secret goes in the fragment, which browsers never send. In the query string it
// would reach the logs through the page’s own request line and through the Referer of
// every request the page makes after it.
export function makeConfirmationLink(domainName: string, pagePath: string, secret: ConfirmationSecret): URL {
  const link = new URL(si`https://${domainName}${pagePath}`);

  link.hash = new URLSearchParams({ secret: secret.value }).toString();

  return link;
}

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
  accountCreatedAt: Date;
  newEmail: EmailAddress;
  timestamp: Date;
}

export function makeEmailChangeRequestSecretData(
  accountId: AccountId,
  accountCreatedAt: Date,
  newEmail: EmailAddress
): EmailChangeRequestSecretData {
  return {
    kind: 'EmailChangeRequestSecretData',
    accountId,
    accountCreatedAt,
    newEmail,
    timestamp: new Date(),
  };
}

// Account IDs derive from the email address, so an account deleted and registered
// again at the same address gets the same ID. The creation time tells the two apart
// and keeps a secret issued to the first from redeeming against the second. A secret
// without the field predates it and is treated as issued to some other account.
export function isIssuedForAccount(secretData: unknown, account: Account): boolean {
  const accountCreatedAt = (secretData as any)?.accountCreatedAt;

  return accountCreatedAt instanceof Date && accountCreatedAt.getTime() === account.creationTimestamp.getTime();
}
