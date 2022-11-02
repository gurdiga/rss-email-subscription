import { getTypeName, makeErr, Result } from '../shared/lang';
import { AppStorage, StorageKey } from '../shared/storage';
import { AccountId } from './account';

export interface RegistrationConfirmationSecret {
  kind: 'RegistrationConfirmationSecret';
  value: string;
}

const registrationConfirmationSecretLength = 64;

export function validateRegistrationConfirmationSecret(input: unknown): Result<RegistrationConfirmationSecret> {
  if (!input) {
    return makeErr('Empty input');
  }

  if (typeof input !== 'string') {
    return makeErr(`Input of invalid type: ${getTypeName(input)}`);
  }

  if (input.length !== registrationConfirmationSecretLength) {
    return makeErr(`Input of invalid length; expected ${registrationConfirmationSecretLength}`);
  }

  return makeRegistrationConfirmationSecret(input);
}

export function makeRegistrationConfirmationSecret(input: string): RegistrationConfirmationSecret {
  return {
    kind: 'RegistrationConfirmationSecret',
    value: input,
  };
}

export function storeRegistrationConfirmationSecret(
  storage: AppStorage,
  secret: RegistrationConfirmationSecret,
  accountId: AccountId
): Result<void> {
  const storageKey = getStorageKey(secret);

  return storage.storeItem(storageKey, accountId);
}

export function deleteRegistrationConfirmationSecret(
  storage: AppStorage,
  secret: RegistrationConfirmationSecret
): Result<void> {
  const storageKey = getStorageKey(secret);

  return storage.removeItem(storageKey);
}

export function getAccountIdForRegistrationConfirmationSecret(
  storage: AppStorage,
  secret: RegistrationConfirmationSecret
): Result<AccountId> {
  const storageKey = getStorageKey(secret);

  return storage.loadItem(storageKey);
}

function getStorageKey(secret: RegistrationConfirmationSecret): StorageKey {
  return `/confirmation-secrets/${secret.value}.json`;
}
