import { getTypeName, makeErr, Result } from '../shared/lang';
import { AppStorage, StorageKey } from './storage';
import { si } from '../shared/string-utils';
import { makePath } from '../shared/path-utils';
import { AccountId } from './account';

export interface ConfirmationSecret {
  kind: 'ConfirmationSecret';
  value: string;
}

const confirmationSecretLength = 64;

export function validateConfirmationSecret(input: unknown): Result<ConfirmationSecret> {
  if (!input) {
    return makeErr('Empty input');
  }

  if (typeof input !== 'string') {
    return makeErr(si`Input of invalid type: ${getTypeName(input)}`);
  }

  if (input.length !== confirmationSecretLength) {
    return makeErr(si`Input of invalid length; expected ${confirmationSecretLength}`);
  }

  return makeConfirmationSecret(input);
}

export function makeConfirmationSecret(input: string): ConfirmationSecret {
  return {
    kind: 'ConfirmationSecret',
    value: input,
  };
}

export function storeConfirmationSecret(storage: AppStorage, secret: ConfirmationSecret, data: any): Result<void> {
  const storageKey = getStorageKey(secret);

  return storage.storeItem(storageKey, data);
}

export function deleteConfirmationSecret(storage: AppStorage, secret: ConfirmationSecret): Result<void> {
  const storageKey = getStorageKey(secret);

  return storage.removeItem(storageKey);
}

export function getDataForConfirmationSecret(storage: AppStorage, secret: ConfirmationSecret): Result<AccountId> {
  const storageKey = getStorageKey(secret);

  return storage.loadItem(storageKey);
}

function getStorageKey(secret: ConfirmationSecret): StorageKey {
  return makePath('/confirmation-secrets', si`${secret.value}.json`);
}
