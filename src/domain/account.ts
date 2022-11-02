import { EmailAddress, EmailHashFn, makeEmailAddress } from '../app/email-sending/emails';
import { hash } from '../shared/crypto';

import { parseDate } from '../shared/date-utils';
import { isErr, makeErr, Result } from '../shared/lang';
import { AppStorage, StorageKey } from '../shared/storage';
import { HashedPassword, makeHashedPassword } from './hashed-password';
import { makePlanId, PlanId } from './plan';

export type AccountId = string;

export interface Account {
  plan: PlanId;
  email: EmailAddress;
  hashedPassword: HashedPassword;
  creationTimestamp: Date;
  confirmationTimestamp?: Date;
}

export interface AccountData {
  plan: string;
  email: string;
  hashedPassword: string;
  creationTimestamp: Date;
  confirmationTimestamp?: Date;
}

export function loadAccount(
  storage: AppStorage,
  accountId: AccountId,
  storageKey = getAccountStorageKey(accountId)
): Result<Account> {
  const loadItemResult = storage.loadItem(storageKey);

  if (isErr(loadItemResult)) {
    return makeErr(`Can’t storage.loadItem: ${loadItemResult.reason}`);
  }

  const email = makeEmailAddress(loadItemResult.email);

  if (isErr(email)) {
    return makeErr(`Invalid stored data for account ${accountId}: ${email.reason}`);
  }

  const plan = makePlanId(loadItemResult.plan);

  if (isErr(plan)) {
    return makeErr(`Invalid stored data for account ${accountId}: ${plan.reason}`);
  }

  const hashedPassword = makeHashedPassword(loadItemResult.hashedPassword);

  if (isErr(hashedPassword)) {
    return makeErr(`Invalid stored data for account ${accountId}: ${hashedPassword.reason}`);
  }

  const creationTimestamp = parseDate(loadItemResult.creationTimestamp);

  if (isErr(creationTimestamp)) {
    return makeErr(`Invalid stored data for account ${accountId}: ${creationTimestamp.reason}`);
  }

  return {
    plan,
    email,
    hashedPassword,
    creationTimestamp,
  };
}

export function storeAccount(storage: AppStorage, accountId: AccountId, account: Account): Result<void> {
  const storageKey = getAccountStorageKey(accountId);
  const data: AccountData = {
    plan: account.plan,
    email: account.email.value,
    hashedPassword: account.hashedPassword.value,
    creationTimestamp: account.creationTimestamp,
    confirmationTimestamp: account.confirmationTimestamp,
  };

  const storeItemResult = storage.storeItem(storageKey, data);

  if (isErr(storeItemResult)) {
    return makeErr(`Couldn’t storeAccount: ${storeItemResult.reason}`);
  }
}

export const accountsStorageKey = '/accounts';

function getAccountStorageKey(accountId: AccountId): StorageKey {
  return `${accountsStorageKey}/${accountId}/account.json`;
}

export function getAccountIdByEmail(email: EmailAddress, hashingSalt: string): string {
  return hash(email.value, hashingSalt);
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
    return makeErr(`Couldn’t confirmAccount: ${storeAccountResult.reason}`);
  }
}

export const emailHashToIdIndexStorageKey = `${accountsStorageKey}/email-hash-to-id`;

// TODO: remove
export function indexAccountByEmailHash(
  storage: AppStorage,
  account: Account,
  accountId: AccountId,
  emailHashFn: EmailHashFn
): Result<void> {
  const indexEntryStorageKey = `${emailHashToIdIndexStorageKey}/${emailHashFn(account.email)}.json`;
  const storeIndexEntryResult = storage.storeItem(indexEntryStorageKey, accountId);

  if (isErr(storeIndexEntryResult)) {
    return makeErr(`Couldn’t store index entry: ${storeIndexEntryResult.reason}`);
  }
}

export function accountExists(storage: AppStorage, accountId: AccountId): Result<boolean> {
  const storageKey = getAccountStorageKey(accountId);
  const hasItemResult = storage.hasItem(storageKey);

  if (isErr(hasItemResult)) {
    return makeErr(`Can’t check storage.hasItem: ${hasItemResult.reason}`);
  }

  return hasItemResult;
}
