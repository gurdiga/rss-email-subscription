import { makeEmailAddress, makeOptionalEmailAddress } from './email-address-making';
import { parseDate, parseOptionalDate } from '../shared/date-utils';
import { isErr, makeErr, Result } from '../shared/lang';
import { AppStorage, StorageKey } from './storage';
import { si } from '../shared/string-utils';
import { makePath } from '../shared/path-utils';
import { makeHashedPassword } from './hashed-password';
import { AccountIdList, makeAccountId, isAccountId, AccountId, Account, AccountData } from './account';
import { EmailAddress } from './email-address';

export function getAccountIdList(storage: AppStorage): Result<AccountIdList> {
  const accountIdStrings = storage.listSubdirectories(accountsStorageKey);

  if (isErr(accountIdStrings)) {
    return makeErr(si`Failed to list accoundIds: ${accountIdStrings.reason}`);
  }

  const results = accountIdStrings.map(makeAccountId);
  const accountIds = results.filter(isAccountId);
  const errs = results.filter(isErr);

  return { accountIds, errs };
}

export function confirmAccount(
  storage: AppStorage,
  accountId: AccountId,
  getCurrentTimestampFn = () => new Date()
): Result<void> {
  const account = loadAccount(storage, accountId);

  if (isErr(account)) {
    return account;
  }

  account.confirmationTimestamp = getCurrentTimestampFn();

  const storeAccountResult = storeAccount(storage, accountId, account);

  if (isErr(storeAccountResult)) {
    return makeErr(si`Couldn’t ${storeAccount.name}: ${storeAccountResult.reason}`);
  }
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
): Result<Account> {
  const item = storage.loadItem(storageKey);

  if (isErr(item)) {
    return makeErr(si`Failed to load account data: ${item.reason}`);
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

  const creationTimestamp = parseDate(item.creationTimestamp);

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
    email,
    newUnconfirmedEmail,
    newUnconfirmedEmailTimestamp,
    hashedPassword,
    creationTimestamp,
    confirmationTimestamp,
  };
}

export function storeAccount(storage: AppStorage, accountId: AccountId, account: Account): Result<void> {
  const storageKey = getAccountStorageKey(accountId);
  const data: AccountData = {
    email: account.email.value,
    newUnconfirmedEmail: account.newUnconfirmedEmail?.value,
    newUnconfirmedEmailTimestamp: account.newUnconfirmedEmailTimestamp,
    hashedPassword: account.hashedPassword.value,
    creationTimestamp: account.creationTimestamp,
    confirmationTimestamp: account.confirmationTimestamp,
  };

  const storeItemResult = storage.storeItem(storageKey, data);

  if (isErr(storeItemResult)) {
    return makeErr(si`Couldn’t ${storeAccount.name}: ${storeItemResult.reason}`);
  }
}

export const accountsStorageKey = '/accounts';

export function getAccountStorageKey(accountId: AccountId): StorageKey {
  return makePath(accountsStorageKey, accountId.value, 'account.json');
}

export function setAccountNewUnconfirmedEmail(
  accountId: AccountId,
  newEmail: EmailAddress,
  storage: AppStorage
): Result<void> {
  const account = loadAccount(storage, accountId);

  if (isErr(account)) {
    return makeErr(si`Failed to ${loadAccount.name}: ${account.reason}`);
  }

  account.newUnconfirmedEmail = newEmail;
  account.newUnconfirmedEmailTimestamp = new Date();

  return storeAccount(storage, accountId, account);
}
