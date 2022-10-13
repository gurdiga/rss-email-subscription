import { EmailAddress, makeEmailAddress } from '../app/email-sending/emails';
import { parseDate } from '../shared/date-utils';
import { isErr, makeErr, Result } from '../shared/lang';
import { AppStorage, StorageKey } from '../shared/storage';
import { AccountId } from './account-index';
import { HashedPassword, makeHashedPassword } from './hashed-password';
import { makePlanId, PlanId } from './plan';

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
  accountIn: AccountId,
  storageKey = getAccountStorageKey(accountIn)
): Result<Account> {
  const loadItemResult = storage.loadItem(storageKey);

  if (isErr(loadItemResult)) {
    return makeErr(`Can’t load account data: ${loadItemResult.reason}`);
  }

  const email = makeEmailAddress(loadItemResult.email);

  if (isErr(email)) {
    return makeErr(`Invalid email while loading account ${accountIn}: ${email.reason}`);
  }

  const plan = makePlanId(loadItemResult.plan);

  if (isErr(plan)) {
    return makeErr(`Invalid plan ID while loading account ${accountIn}: ${plan.reason}`);
  }

  const hashedPassword = makeHashedPassword(loadItemResult.hashedPassword);

  if (isErr(hashedPassword)) {
    return makeErr(`Invalid hashed password while loading account ${accountIn}: ${hashedPassword.reason}`);
  }

  const creationTimestamp = parseDate(loadItemResult.creationTimestamp);

  if (isErr(creationTimestamp)) {
    return makeErr(`Invalid creation timestamp while loading account ${accountIn}: ${creationTimestamp.reason}`);
  }

  return {
    plan,
    email,
    hashedPassword,
    creationTimestamp,
  };
}

export function storeAccount(
  storage: AppStorage,
  accountIn: AccountId,
  account: Account,
  storageKey = getAccountStorageKey(accountIn)
): Result<void> {
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

function getAccountStorageKey(accountIn: AccountId): StorageKey {
  return `/accounts/${accountIn}/account.json`;
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
