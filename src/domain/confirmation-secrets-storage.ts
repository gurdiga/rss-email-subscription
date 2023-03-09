import { isErr, Result } from '../shared/lang';
import { AppStorage, StorageKey } from './storage';
import { si } from '../shared/string-utils';
import { makePath } from '../shared/path-utils';
import { ConfirmationSecret, ConfirmationSecretNotFound, makeConfirmationSecretNotFound } from './confirmation-secrets';

export function loadConfirmationSecret<T>(
  storage: AppStorage,
  secret: ConfirmationSecret
): Result<ConfirmationSecretNotFound | T> {
  const storageKey = getStorageKey(secret);
  const exists = storage.hasItem(storageKey);

  if (isErr(exists)) {
    return makeConfirmationSecretNotFound(secret);
  }

  return storage.loadItem(storageKey);
}

export function storeConfirmationSecret<D>(storage: AppStorage, secret: ConfirmationSecret, data: D): Result<void> {
  const storageKey = getStorageKey(secret);

  return storage.storeItem(storageKey, data);
}

export function deleteConfirmationSecret(storage: AppStorage, secret: ConfirmationSecret): Result<void> {
  const storageKey = getStorageKey(secret);

  return storage.removeItem(storageKey);
}

export function getStorageKey(secret: ConfirmationSecret): StorageKey {
  return makePath('/confirmation-secrets', si`${secret.value}.json`);
}
