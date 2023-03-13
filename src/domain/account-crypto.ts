import { hash } from '../shared/crypto';
import { si } from '../shared/string-utils';
import { AccountId, makeAccountId } from './account';
import { EmailAddress } from './email-address';

export function getAccountIdByEmail(email: EmailAddress, hashingSalt: string): AccountId {
  // ASSUMPTION: SHA256 gives good enough uniqueness (extremely rare collisions).
  // ASSUMPTION: SHA256 is 64-character long.
  return makeAccountId(hash(email.value, hashingSalt)) as AccountId;
}

export function makeRegistrationConfirmationSecretHash(email: EmailAddress, hashingSalt: string): string {
  return hash(email.value, si`registration-confirmation-secret-${hashingSalt}`);
}

export function makeEmailChangeConfirmationSecretHash(email: EmailAddress, hashingSalt: string): string {
  return hash(email.value, si`email-change-confirmation-secret-${hashingSalt}`);
}
