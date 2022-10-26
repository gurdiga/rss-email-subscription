import { EmailAddress } from '../app/email-sending/emails';
import { hasKind, isErr, makeErr, Result } from '../shared/lang';
import { AppStorage } from '../shared/storage';

export interface AccountIndex {
  version: number;
  [email: string]: AccountId;
}

export type AccountId = number;

export function addEmailToIndex(storage: AppStorage, accountId: AccountId, email: EmailAddress): Result<void> {
  const accountIndex = loadAccountIndex(storage);

  if (isErr(accountIndex)) {
    return makeErr(`Can’t load account index: ${accountIndex.reason}`);
  }

  accountIndex[email.value] = accountId;

  const storeAccountIndexResult = storedAccountIndex(storage, accountIndex);

  if (isErr(storeAccountIndexResult)) {
    return makeErr(`Can’t store account index: ${storeAccountIndexResult.reason}`);
  }
}

export function removeEmailFromIndex(storage: AppStorage, email: EmailAddress): Result<void> {
  const accountIndex = loadAccountIndex(storage);

  if (isErr(accountIndex)) {
    return makeErr(`Can’t load account index: ${accountIndex.reason}`);
  }

  (accountIndex as any)[email.value] = undefined;

  const storeAccountIndexResult = storedAccountIndex(storage, accountIndex);

  if (isErr(storeAccountIndexResult)) {
    return makeErr(`Can’t store account index: ${storeAccountIndexResult.reason}`);
  }
}

export interface AccountNotFound {
  kind: 'AccountNotFound';
}

export function isAccountNotFound(value: unknown): value is AccountNotFound {
  return hasKind(value, 'AccountNotFound');
}

export function findAccountIdByEmail(storage: AppStorage, email: EmailAddress): Result<AccountId | AccountNotFound> {
  const loadItemResult = loadAccountIndex(storage);

  if (isErr(loadItemResult)) {
    return makeErr(`Can’t findAccountIdByEmail: ${loadItemResult.reason}`);
  }

  const accountIndex: AccountIndex = loadItemResult;
  const accountId = accountIndex[email.value];

  if (!accountId) {
    return { kind: 'AccountNotFound' };
  }

  return accountId;
}

export const accountIndexStorageKey = '/accounts/index.json';

function loadAccountIndex(storage: AppStorage): Result<AccountIndex> {
  const loadItemResult = storage.loadItem(accountIndexStorageKey);

  if (isErr(loadItemResult)) {
    return makeErr(`Can’t read account index: ${loadItemResult.reason}`);
  }

  return loadItemResult;
}

export function storedAccountIndex(
  storage: AppStorage,
  accountIndex: AccountIndex,
  generateIndexVersionFn = generateIndexVersion
): Result<void> {
  const mostRecentStoredIndex = loadAccountIndex(storage);

  if (isErr(mostRecentStoredIndex)) {
    return makeErr(`Can’t read most recent account index: ${mostRecentStoredIndex.reason}`);
  }

  const mostRecentIndexVersion = mostRecentStoredIndex.version;

  if (mostRecentIndexVersion !== accountIndex.version) {
    // This can only happen with multiple Node processes working with the same storage.
    return makeErr('Account index version changed since last read');
  }

  accountIndex.version = generateIndexVersionFn();

  const storeItemResult = storage.storeItem(accountIndexStorageKey, accountIndex);

  if (isErr(storeItemResult)) {
    return makeErr(`Can’t record index: ${storeItemResult.reason}`);
  }
}

export function generateIndexVersion(): number {
  return new Date().getTime() + Math.random();
}
