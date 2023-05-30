import { makeDate, parseOptionalDate } from '../shared/date-utils';
import { isErr, makeErr, Result } from '../shared/lang';
import { makePath } from '../shared/path-utils';
import { si } from '../shared/string-utils';
import {
  Account,
  AccountData,
  AccountId,
  AccountIdList,
  AccountNotFound,
  isAccountId,
  isAccountNotFound,
  makeAccountId,
  makeAccountNotFound,
} from './account';
import { getAccountIdByEmail } from './account-crypto';
import { EmailAddress } from './email-address';
import { makeEmailAddress, makeOptionalEmailAddress } from './email-address-making';
import { makeHashedPassword } from './hashed-password';
import { makePlanId } from './plan';
import { AppStorage, StorageKey } from './storage';

export function getAccountIdList(storage: AppStorage): Result<AccountIdList> {
  const accountIdStrings = storage.listSubdirectories(accountsStorageKey);

  if (isErr(accountIdStrings)) {
    return makeErr(si`Failed to list accoundIds: ${accountIdStrings.reason}`);
  }

  const results = accountIdStrings.map((x) => makeAccountId(x));
  const accountIds = results.filter(isAccountId);
  const errs = results.filter(isErr);

  return { accountIds, errs };
}

export function confirmAccount(
  storage: AppStorage,
  accountId: AccountId,
  getCurrentTimestampFn = () => new Date()
): Result<AccountNotFound | void> {
  const account = loadAccount(storage, accountId);

  if (isErr(account) || isAccountNotFound(account)) {
    return account;
  }

  account.confirmationTimestamp = getCurrentTimestampFn();

  const storeAccountResult = storeAccount(storage, accountId, account);

  if (isErr(storeAccountResult)) {
    return makeErr(si`Couldn’t ${storeAccount.name}: ${storeAccountResult.reason}`);
  }
}

export function setAccountEmail(
  storage: AppStorage,
  accountId: AccountId,
  newEmail: EmailAddress,
  hashingSalt: string
): Result<AccountNotFound | EmailAddress> {
  const account = loadAccount(storage, accountId);

  if (isErr(account) || isAccountNotFound(account)) {
    return account;
  }

  const oldEmail = account.email;

  account.email = newEmail;

  const storeResult = storeAccount(storage, accountId, account);

  if (isErr(storeResult)) {
    return storeResult;
  }

  const newAccountId = getAccountIdByEmail(newEmail, hashingSalt);
  const oldStorageKey = getAccountRootStorageKey(accountId);
  const newStorageKey = getAccountRootStorageKey(newAccountId);

  const renameResult = storage.renameItem(oldStorageKey, newStorageKey);

  if (isErr(renameResult)) {
    return makeErr(si`Failed to rename item: ${renameResult.reason}`);
  }

  return oldEmail;
}

export function accountExists(storage: AppStorage, accountId: AccountId): Result<boolean> {
  const storageKey = getAccountStorageKey(accountId);
  const hasItemResult = storage.hasItem(storageKey);

  if (isErr(hasItemResult)) {
    return makeErr(si`Failed to check account exists: ${hasItemResult.reason}`);
  }

  return hasItemResult;
}

export function loadAccount(
  storage: AppStorage,
  accountId: AccountId,
  storageKey = getAccountStorageKey(accountId)
): Result<AccountNotFound | Account> {
  const exists = storage.hasItem(storageKey);

  if (isErr(exists)) {
    return makeErr(si`Failed to check account exists: ${exists.reason}`);
  }

  if (exists === false) {
    return makeAccountNotFound();
  }

  const item = storage.loadItem(storageKey);

  if (isErr(item)) {
    return makeErr(si`Failed to load account data: ${item.reason}`);
  }

  const planId = makePlanId(item.planId);

  if (isErr(planId)) {
    return makeErr(si`Invalid stored data for account ${accountId.value}: ${planId.reason}`, 'planId');
  }

  const email = makeEmailAddress(item.email);

  if (isErr(email)) {
    return makeErr(si`Invalid stored data for account ${accountId.value}: ${email.reason}`, 'email');
  }

  const newUnconfirmedEmail = makeOptionalEmailAddress(item.newUnconfirmedEmail);

  if (isErr(newUnconfirmedEmail)) {
    return makeErr(
      si`Invalid stored data for account ${accountId.value}: ${newUnconfirmedEmail.reason}`,
      'newUnconfirmedEmail'
    );
  }

  const newUnconfirmedEmailTimestamp = parseOptionalDate(item.newUnconfirmedEmailTimestamp);

  if (isErr(newUnconfirmedEmailTimestamp)) {
    return makeErr(
      si`Invalid stored data for account ${accountId.value}: ${newUnconfirmedEmailTimestamp.reason}`,
      'newUnconfirmedEmailTimestamp'
    );
  }

  const hashedPassword = makeHashedPassword(item.hashedPassword);

  if (isErr(hashedPassword)) {
    return makeErr(si`Invalid stored data for account ${accountId.value}: ${hashedPassword.reason}`, 'hashedPassword');
  }

  const creationTimestamp = makeDate(item.creationTimestamp);

  if (isErr(creationTimestamp)) {
    return makeErr(
      si`Invalid stored data for account ${accountId.value}: ${creationTimestamp.reason}`,
      'creationTimestamp'
    );
  }

  const confirmationTimestamp = parseOptionalDate(item.confirmationTimestamp);

  if (isErr(confirmationTimestamp)) {
    return makeErr(
      si`Invalid stored data for account ${accountId.value}: ${confirmationTimestamp.reason}`,
      'confirmationTimestamp'
    );
  }

  return {
    planId,
    email,
    hashedPassword,
    creationTimestamp,
    confirmationTimestamp,
  };
}

export function storeAccount(storage: AppStorage, accountId: AccountId, account: Account): Result<void> {
  const storageKey = getAccountStorageKey(accountId);
  const data: AccountData = {
    planId: account.planId,
    email: account.email.value,
    hashedPassword: account.hashedPassword.value,
    creationTimestamp: account.creationTimestamp,
    confirmationTimestamp: account.confirmationTimestamp,
  };

  const storeItemResult = storage.storeItem(storageKey, data);

  if (isErr(storeItemResult)) {
    return makeErr(si`Couldn’t ${storeAccount.name}: ${storeItemResult.reason}`);
  }
}

export function deleteAccount(storage: AppStorage, accountId: AccountId): Result<AccountNotFound | void> {
  const storageKey = getAccountRootStorageKey(accountId);
  const exists = storage.hasItem(storageKey);

  if (isErr(exists)) {
    return makeErr(si`Failed to check account exists: ${exists.reason}`);
  }

  if (exists === false) {
    return makeAccountNotFound();
  }

  const removeTreeResult = storage.removeTree(storageKey);

  if (isErr(removeTreeResult)) {
    return makeErr(si`Couldn’t removeTree: ${removeTreeResult.reason}`);
  }
}

export const accountsStorageKey = '/accounts';

export function getAccountRootStorageKey(accountId: AccountId): StorageKey {
  return makePath(accountsStorageKey, accountId.value);
}

export function getAccountStorageKey(accountId: AccountId): StorageKey {
  return makePath(getAccountRootStorageKey(accountId), 'account.json');
}

export function getAllAccountIds(storage: AppStorage): Result<AccountId[]> {
  const accountDirs = storage.listSubdirectories(accountsStorageKey);

  if (isErr(accountDirs)) {
    return makeErr(si`Failed to list account subdirectories: ${accountDirs.reason}`);
  }

  const results = accountDirs.map((x) => makeAccountId(x));
  const err = results.find(isErr);

  if (err) {
    return makeErr(si`Failed to ${makeAccountId.name} from subdir name: ${err.reason}`);
  }

  return results.filter(isAccountId);
}
