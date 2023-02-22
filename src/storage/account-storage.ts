import { makeEmailAddress } from '../domain/email-address-making';
import { parseDate, parseOptionalDate } from '../shared/date-utils';
import { isErr, makeErr, Result } from '../shared/lang';
import { AppStorage, StorageKey } from './storage';
import { si } from '../shared/string-utils';
import { makePath } from '../shared/path-utils';
import { makeHashedPassword } from '../domain/hashed-password';
import { makePlanId } from '../domain/plan';
import { AccountIdList, makeAccountId, isAccountId, AccountId, Account, AccountData } from '../domain/account';

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
  const loadItemResult = storage.loadItem(storageKey);

  if (isErr(loadItemResult)) {
    return makeErr(si`Failed to load account data: ${loadItemResult.reason}`);
  }

  const email = makeEmailAddress(loadItemResult.email);

  if (isErr(email)) {
    return makeErr(si`Invalid stored data for account ${accountId.value}: ${email.reason}`, 'email');
  }

  const planId = makePlanId(loadItemResult.plan);

  if (isErr(planId)) {
    return makeErr(si`Invalid stored data for account ${accountId.value}: ${planId.reason}`, 'plan');
  }

  const hashedPassword = makeHashedPassword(loadItemResult.hashedPassword);

  if (isErr(hashedPassword)) {
    return makeErr(si`Invalid stored data for account ${accountId.value}: ${hashedPassword.reason}`, 'hashedPassword');
  }

  const creationTimestamp = parseDate(loadItemResult.creationTimestamp);

  if (isErr(creationTimestamp)) {
    return makeErr(
      si`Invalid stored data for account ${accountId.value}: ${creationTimestamp.reason}`,
      'creationTimestamp'
    );
  }

  const confirmationTimestamp = parseOptionalDate(loadItemResult.confirmationTimestamp);

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
    plan: account.planId,
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

export const accountsStorageKey = '/accounts';

export function getAccountStorageKey(accountId: AccountId): StorageKey {
  return makePath(accountsStorageKey, accountId.value, 'account.json');
}
