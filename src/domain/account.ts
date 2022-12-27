import { EmailAddress, makeEmailAddress } from '../app/email-sending/emails';
import { hash } from '../shared/crypto';

import { parseDate } from '../shared/date-utils';
import { hasKind, isErr, makeErr, readStringArray, Result } from '../shared/lang';
import { AppStorage, StorageKey } from '../shared/storage';
import { si } from '../shared/string-utils';
import { makePath } from '../shared/path-utils';
import { FeedId, isFeedId, makeFeedId } from './feed';
import { HashedPassword, makeHashedPassword } from './hashed-password';
import { makePlanId, PlanId } from './plan';

export interface AccountId {
  kind: 'AccountId';
  value: string;
}

export function makeAccountId(value: string): AccountId {
  return {
    kind: 'AccountId',
    value,
  };
}

export function isAccountId(value: unknown): value is AccountId {
  return hasKind(value, 'AccountId');
}

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
    return makeErr(si`Failed to load account data: ${loadItemResult.reason}`);
  }

  const email = makeEmailAddress(loadItemResult.email);

  if (isErr(email)) {
    return makeErr(si`Invalid stored data for account ${accountId.value}: ${email.reason}`, 'email');
  }

  const plan = makePlanId(loadItemResult.plan);

  if (isErr(plan)) {
    return makeErr(si`Invalid stored data for account ${accountId.value}: ${plan.reason}`, 'plan');
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

  const strings = readStringArray(loadItemResult.feedIds);

  if (isErr(strings)) {
    return makeErr(si`Non-string stored feedIds for account ${accountId.value}: ${strings.reason}`, 'feedIds');
  }

  const results = strings.map(makeFeedId);
  const feedIds = results.filter(isFeedId);
  const errs = results.filter(isErr).map((x) => x.reason);

  if (errs.length > 0) {
    return makeErr(
      si`Some of the stored feedIds (${strings.join()}) for account ${accountId.value} are invalid: ${errs.join()}`,
      'feedIds'
    );
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
    return makeErr(si`Couldn’t storeAccount: ${storeItemResult.reason}`);
  }
}

export const accountsStorageKey = '/accounts';

// TODO: Add unit test
export function getAccountStorageKey(accountId: AccountId): StorageKey {
  return makePath(accountsStorageKey, accountId.value, 'account.json');
}

export function getAccountIdByEmail(email: EmailAddress, hashingSalt: string): AccountId {
  // ASSUMPTION: SHA256 gives good enough uniqueness (extremely rare collisions).
  return makeAccountId(hash(email.value, hashingSalt));
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
    return makeErr(si`Couldn’t confirmAccount: ${storeAccountResult.reason}`);
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
