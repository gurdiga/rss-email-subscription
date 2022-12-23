import { EmailAddress, makeEmailAddress } from '../app/email-sending/emails';
import { hash } from '../shared/crypto';

import { parseDate } from '../shared/date-utils';
import { isErr, makeErr, readStringArray, Result } from '../shared/lang';
import { AppStorage, StorageKey } from '../shared/storage';
import { FeedId, isFeedId, makeFeedId } from './feed';
import { HashedPassword, makeHashedPassword } from './hashed-password';
import { makePlanId, PlanId } from './plan';

export type AccountId = string;

export interface Account {
  plan: PlanId;
  email: EmailAddress;
  hashedPassword: HashedPassword;
  creationTimestamp: Date;
  confirmationTimestamp?: Date;
  feedIds: FeedId[];
}

export interface AccountData {
  plan: string;
  email: string;
  hashedPassword: string;
  creationTimestamp: Date;
  confirmationTimestamp?: Date;
  feedIds?: string[];
}

export function loadAccount(
  storage: AppStorage,
  accountId: AccountId,
  storageKey = getAccountStorageKey(accountId)
): Result<Account> {
  const loadItemResult = storage.loadItem(storageKey);

  if (isErr(loadItemResult)) {
    return makeErr(`Failed to load account data: ${loadItemResult.reason}`);
  }

  const email = makeEmailAddress(loadItemResult.email);

  if (isErr(email)) {
    return makeErr(`Invalid stored data for account ${accountId}: ${email.reason}`, 'email');
  }

  const plan = makePlanId(loadItemResult.plan);

  if (isErr(plan)) {
    return makeErr(`Invalid stored data for account ${accountId}: ${plan.reason}`, 'plan');
  }

  const hashedPassword = makeHashedPassword(loadItemResult.hashedPassword);

  if (isErr(hashedPassword)) {
    return makeErr(`Invalid stored data for account ${accountId}: ${hashedPassword.reason}`, 'hashedPassword');
  }

  const creationTimestamp = parseDate(loadItemResult.creationTimestamp);

  if (isErr(creationTimestamp)) {
    return makeErr(`Invalid stored data for account ${accountId}: ${creationTimestamp.reason}`, 'creationTimestamp');
  }

  const strings = readStringArray(loadItemResult.feedIds);

  if (isErr(strings)) {
    return makeErr(`Non-string stored feedIds for account ${accountId}: ${strings.reason}`, 'feedIds');
  }

  const results = strings.map(makeFeedId);
  const feedIds = results.filter(isFeedId);
  const errs = results.filter(isErr).map((x) => x.reason);

  if (errs.length > 0) {
    return makeErr(`Some of the stored feedIds (${strings}) for account ${accountId} are invalid: ${errs}`, 'feedIds');
  }

  return {
    plan,
    email,
    hashedPassword,
    creationTimestamp,
    feedIds,
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

export function getAccountStorageKey(accountId: AccountId): StorageKey {
  return `${accountsStorageKey}/${accountId}/account.json`;
}

export function getAccountIdByEmail(email: EmailAddress, hashingSalt: string): AccountId {
  // ASSUMPTION: SHA256 gives good enough uniqueness (extremely rare collisions).
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

export function accountExists(storage: AppStorage, accountId: AccountId): Result<boolean> {
  const storageKey = getAccountStorageKey(accountId);
  const hasItemResult = storage.hasItem(storageKey);

  if (isErr(hasItemResult)) {
    return makeErr(`Failed to check account exists: ${hasItemResult.reason}`);
  }

  return hasItemResult;
}
