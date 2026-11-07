import { basename } from 'node:path/posix';
import { attempt, Err, hasKind, isErr, makeErr, Result } from '../shared/lang';
import { AccountId } from './account';
import { AppStorage, StorageKey } from './storage';
import { makeDate } from '../shared/date-utils';
import { si } from '../shared/string-utils';
import { makePath } from '../shared/path-utils';
import {
  ConfirmationSecret,
  ConfirmationSecretKind,
  ConfirmationSecretNotFound,
  confirmationSecretLifetimeMs,
  isConfirmationSecretNotFound,
  makeConfirmationSecret,
  makeConfirmationSecretNotFound,
} from './confirmation-secrets';

// For the events that change who an account's secrets should answer to: deletion,
// an email change, a password change or reset. Expired records go too, since they
// are dead anyway. Records without a kind are left alone, as no kind matches them.
export function revokeAccountSecrets(
  storage: AppStorage,
  accountId: AccountId,
  kinds: ConfirmationSecretKind[]
): Result<void> {
  // No directory means no secrets yet, not a failure: deleteAccount depends on this
  // returning cleanly.
  const hasSecrets = storage.hasItem(confirmationSecretsStorageKey);

  if (isErr(hasSecrets)) {
    return hasSecrets;
  }

  if (!hasSecrets) {
    return;
  }

  const secrets = listConfirmationSecrets(storage);

  if (isErr(secrets)) {
    return secrets;
  }

  for (const secret of secrets.validConfirmationSecrets) {
    const data = loadConfirmationSecretRegardlessOfExpiry(storage, secret);

    if (isErr(data) || isConfirmationSecretNotFound(data)) {
      continue;
    }

    const isOfGivenKind = kinds.some((kind) => hasKind(data, kind));
    const isOfGivenAccount = getSecretAccountIdValue(data) === accountId.value;

    if (!isOfGivenKind || !isOfGivenAccount) {
      continue;
    }

    const deleteResult = deleteConfirmationSecret(storage, secret);

    if (isErr(deleteResult)) {
      return makeErr(si`Failed to ${deleteConfirmationSecret.name}: ${deleteResult.reason}`);
    }
  }
}

// A secret minted for one purpose reads as unknown to every other, so it can be
// neither redeemed nor consumed there.
export function loadConfirmationSecretOfKind<T>(
  storage: AppStorage,
  secret: ConfirmationSecret,
  kind: ConfirmationSecretKind
): Result<ConfirmationSecretNotFound | T> {
  const data = loadConfirmationSecret<T>(storage, secret);

  if (isErr(data) || isConfirmationSecretNotFound(data)) {
    return data;
  }

  if (!hasKind(data, kind)) {
    return makeConfirmationSecretNotFound(secret);
  }

  return data;
}

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

// For the cleanup cron and revokeAccountSecrets only: they need to see an
// expired-but-still-on-disk record in order to delete it, so they have to bypass the
// expiry gate loadConfirmationSecret applies for redemption — otherwise an expired
// record reads back as already gone and is skipped, leaving it on disk indefinitely.
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

// Reset secrets store the bare ID string; the other kinds store the AccountId object.
function getSecretAccountIdValue(data: unknown): unknown {
  const accountId = (data as any)?.accountId;

  return typeof accountId === 'string' ? accountId : accountId?.value;
}

export const confirmationSecretsStorageKey = '/confirmation-secrets';

export function getConfirmationSecretStorageKey(secret: ConfirmationSecret): StorageKey {
  return makePath(confirmationSecretsStorageKey, si`${secret.value}.json`);
}
