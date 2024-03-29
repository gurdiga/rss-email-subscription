import { isErr, Result } from '../shared/lang';
import { AppStorage, StorageKey } from './storage';
import { si } from '../shared/string-utils';
import { makePath } from '../shared/path-utils';
import { ConfirmationSecret, ConfirmationSecretNotFound, makeConfirmationSecretNotFound } from './confirmation-secrets';

export function loadConfirmationSecret<T>(
  storage: AppStorage,
  secret: ConfirmationSecret
): Result<ConfirmationSecretNotFound | T> {
  const storageKey = getConfirmationSecretStorageKey(secret);
  const exists = storage.hasItem(storageKey);

  if (isErr(exists)) {
    return exists;
  }

  if (exists === false) {
    return makeConfirmationSecretNotFound(secret);
  }

  return storage.loadItem(storageKey);
}

export function storeConfirmationSecret<D>(
  storage: AppStorage,
  secret: ConfirmationSecret,
  data: D,
  timestamp = new Date()
): Result<void> {
  const storageKey = getConfirmationSecretStorageKey(secret);

  return storage.storeItem(storageKey, { ...data, timestamp });
}

export function deleteConfirmationSecret(storage: AppStorage, secret: ConfirmationSecret): Result<void> {
  const storageKey = getConfirmationSecretStorageKey(secret);

  return storage.removeItem(storageKey);
}

export const confirmationSecretsStorageKey = '/confirmation-secrets';

export function getConfirmationSecretStorageKey(secret: ConfirmationSecret): StorageKey {
  return makePath(confirmationSecretsStorageKey, si`${secret.value}.json`);
}
