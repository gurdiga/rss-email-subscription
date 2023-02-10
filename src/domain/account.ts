import { makeEmailAddress } from '../app/email-sending/emails';
import { EmailAddress } from './email-address';
import { hash, hashLength } from '../shared/crypto';
import { parseDate } from '../shared/date-utils';
import { Err, getTypeName, hasKind, isErr, isString, makeErr, Result } from '../shared/lang';
import { AppStorage, StorageKey } from '../storage/storage';
import { si } from '../shared/string-utils';
import { makePath } from '../shared/path-utils';
import { HashedPassword, makeHashedPassword } from './hashed-password';
import { makePlanId, PlanId } from './plan';

export interface AccountId {
  kind: 'AccountId';
  value: string;
}

export function makeAccountId(value: string): Result<AccountId> {
  if (!isString(value)) {
    return makeErr(si`Not a string: ${getTypeName(value)} "${value}"`);
  }

  if (value.length !== hashLength) {
    return makeErr(si`Expected to be a 64-character hex hash: ${getTypeName(value)} "${value}"`);
  }

  return {
    kind: 'AccountId',
    value,
  };
}

export function isAccountId(value: unknown): value is AccountId {
  return hasKind(value, 'AccountId');
}

export interface Account {
  planId: PlanId;
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

  return {
    planId,
    email,
    hashedPassword,
    creationTimestamp,
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

export function getAccountIdByEmail(email: EmailAddress, hashingSalt: string): AccountId {
  // ASSUMPTION: SHA256 gives good enough uniqueness (extremely rare collisions).
  // ASSUMPTION: SHA256 is 64-character long.
  return makeAccountId(hash(email.value, hashingSalt)) as AccountId;
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

export interface AccountNotFound {
  kind: 'AccountNotFound';
}

export function makeAccountNotFound(): AccountNotFound {
  return { kind: 'AccountNotFound' };
}

export function isAccountNotFound(value: unknown): value is AccountNotFound {
  return hasKind(value, 'AccountNotFound');
}

export interface AccountIdList {
  accountIds: AccountId[];
  errs: Err[];
}

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
