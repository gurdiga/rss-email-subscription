import { EmailAddress } from '../app/email-sending/emails';
import { isErr, makeErr, Result } from '../shared/lang';
import { AppStorage } from '../shared/storage';

interface AccountIndex {
  version: number;
  [email: string]: AccountId;
}

export type AccountId = number;

export function recordAccount(storage: AppStorage, accountId: AccountId, email: EmailAddress): Result<void> {
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

export function findAccountByEmail(storage: AppStorage, email: EmailAddress): Result<AccountId> {
  const loadItemResult = loadAccountIndex(storage);

  if (isErr(loadItemResult)) {
    return makeErr(`Can’t read account index: ${loadItemResult.reason}`);
  }

  const accountIndex: AccountIndex = loadItemResult;
  const accountId = accountIndex[email.value];

  if (!accountId) {
    return makeErr(`Can’t find account ID by email ${email.value}`);
  }

  return accountId;
}

function loadAccountIndex(storage: AppStorage): Result<AccountIndex> {
  const loadItemResult = storage.loadItem(`/accounts/index.json`);

  if (isErr(loadItemResult)) {
    return makeErr(`Can’t read account index: ${loadItemResult.reason}`);
  }

  return loadItemResult;
}

function storedAccountIndex(storage: AppStorage, accountIndex: AccountIndex): Result<void> {
  const mostRecentStoredIndex = loadAccountIndex(storage);

  if (isErr(mostRecentStoredIndex)) {
    return makeErr(`Can’t read most recent account index: ${mostRecentStoredIndex.reason}`);
  }

  const mostRecentIndexVersion = mostRecentStoredIndex.version;

  if (mostRecentIndexVersion !== accountIndex.version) {
    return makeErr('Account index version conflict');
  }

  accountIndex.version = generateIndexVersion();

  const storeItemResult = storage.storeItem(`/accounts/index.json`, accountIndex);

  if (isErr(storeItemResult)) {
    return makeErr(`Can’t record index: ${storeItemResult.reason}`);
  }
}

export function generateIndexVersion(): number {
  return new Date().getTime() + Math.random();
}
