import { getTypeName, hasKind, makeErr, Result } from '../shared/lang';
import { AppStorage, StorageKey } from './storage';
import { si } from '../shared/string-utils';
import { makePath } from '../shared/path-utils';
import { AccountId } from './account';

export interface ConfirmationSecret {
  kind: 'ConfirmationSecret';
  value: string;
}

export const confirmationSecretLength = 64;

export function isConfirmationSecret(value: unknown): value is ConfirmationSecret {
  return hasKind(value, 'ConfirmationSecret');
}

export function makeConfirmationSecret(input: unknown): Result<ConfirmationSecret> {
  if (!input) {
    return makeErr('Empty input');
  }

  if (typeof input !== 'string') {
    return makeErr(si`Input of invalid type: ${getTypeName(input)}`);
  }

  if (input.length !== confirmationSecretLength) {
    return makeErr(si`Input of invalid length; expected ${confirmationSecretLength}`);
  }

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
