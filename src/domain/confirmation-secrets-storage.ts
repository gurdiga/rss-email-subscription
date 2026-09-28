import { basename } from 'node:path/posix';
import { attempt, Err, isErr, makeErr, Result } from '../shared/lang';
import { AppStorage, StorageKey } from './storage';
import { makeDate } from '../shared/date-utils';
import { si } from '../shared/string-utils';
import { makePath } from '../shared/path-utils';
import {
  ConfirmationSecret,
  ConfirmationSecretNotFound,
  confirmationSecretLifetimeMs,
  isConfirmationSecretNotFound,
  makeConfirmationSecret,
  makeConfirmationSecretNotFound,
} from './confirmation-secrets';

export function loadConfirmationSecret<T>(
  storage: AppStorage,
  secret: ConfirmationSecret
): Result<ConfirmationSecretNotFound | T> {
  const data = loadConfirmationSecretRegardlessOfExpiry<T>(storage, secret);

  if (isErr(data) || isConfirmationSecretNotFound(data)) {
    return data;
  }

  // The cleanup cron (expireConfirmationSecrets) enforces this same lifetime, but only
  // every few hours — redemption checked it too, so a token isn't usable in the gap
  // between when it should have expired and when cleanup next runs. A record with no
  // parseable timestamp is treated as not-yet-expired rather than rejected: this
  // function is generic over the caller's own data shape, some of which predate this
  // check, and cleanup already handles a malformed record on its own schedule.
  const timestamp = makeDate((data as any)?.timestamp);

  if (!isErr(timestamp) && timestamp.getTime() < Date.now() - confirmationSecretLifetimeMs) {
    return makeConfirmationSecretNotFound(secret);
  }

  return data;
}

// For the cleanup cron only: it needs to see an expired-but-still-on-disk record in
// order to delete it, so it has to bypass the expiry gate loadConfirmationSecret
// applies for redemption — otherwise an expired record reads back as already gone
// and cleanup skips deleting it, leaving it on disk indefinitely.
export function loadConfirmationSecretRegardlessOfExpiry<T>(
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

export function listConfirmationSecrets(storage: AppStorage): Result<ConfirmationSecretList> {
  const items = storage.listItems(confirmationSecretsStorageKey);

  if (isErr(items)) {
    return makeErr(si`Failed to list confirmation secrets from ${confirmationSecretsStorageKey}`);
  }

  const results: ConfirmationSecretList = {
    basenameErrs: [],
    validConfirmationSecrets: [],
    invalidConfirmationSecrets: [],
  };

  const hashes: string[] = [];

  items.forEach((x) => {
    const result = attempt(() => basename(x, '.json'));

    if (isErr(result)) {
      results.basenameErrs.push({ input: x, err: result });
    } else {
      hashes.push(result);
    }
  });

  hashes.forEach((x) => {
    const result = makeConfirmationSecret(x);

    if (isErr(result)) {
      results.invalidConfirmationSecrets.push({
        input: x,
        err: result,
      });
    } else {
      results.validConfirmationSecrets.push(result);
    }
  });

  return results;
}

export interface ConfirmationSecretList {
  basenameErrs: BasenameErr[];
  validConfirmationSecrets: ConfirmationSecret[];
  invalidConfirmationSecrets: InvalidConfirmationSecret[];
}

interface BasenameErr {
  input: string;
  err: Err;
}

interface InvalidConfirmationSecret {
  input: string;
  err: Err;
}

export const confirmationSecretsStorageKey = '/confirmation-secrets';

export function getConfirmationSecretStorageKey(secret: ConfirmationSecret): StorageKey {
  return makePath(confirmationSecretsStorageKey, si`${secret.value}.json`);
}
