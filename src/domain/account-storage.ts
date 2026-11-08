import { makeDate, parseOptionalDate } from '../shared/date-utils';
import { hasKind, isErr, makeErr, Result } from '../shared/lang';
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
import { allConfirmationSecretKinds } from './confirmation-secrets';
import { revokeAccountSecrets } from './confirmation-secrets-storage';
import { getAccountIdByEmail } from './account-crypto';
import { EmailAddress } from './email-address';
import { makeEmailAddress, makeOptionalEmailAddress } from './email-address-making';
import { HashedPassword, makeHashedPassword } from './hashed-password';
import { makePaddleCustomerId, PaddleCustomerId } from './payment';
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

  // Before the rename rather than after: if the rename then fails, the entry names
  // an ID with no account behind it, which lookups already treat as unlinked, and
  // retrying the change converges. After it, a failure would strand a committed
  // change with webhooks resolving to the old ID.
  if (account.paddleCustomerId) {
    const indexResult = storePaddleCustomerIndexEntry(storage, account.paddleCustomerId, newAccountId);

    if (isErr(indexResult)) {
      return indexResult;
    }
  }

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

  const isAdmin = !!item.isAdmin;

  // Missing for an account stored before this field existed: treat it as never
  // changed since creation, which is also correct — no session could predate
  // both this field and the account itself.
  const passwordChangedAtResult = parseOptionalDate(item.passwordChangedAt);

  if (isErr(passwordChangedAtResult)) {
    return makeErr(
      si`Invalid stored data for account ${accountId.value}: ${passwordChangedAtResult.reason}`,
      'passwordChangedAt'
    );
  }

  const passwordChangedAt = passwordChangedAtResult ?? creationTimestamp;

  const paddleCustomerId =
    item.paddleCustomerId === undefined ? undefined : makePaddleCustomerId(item.paddleCustomerId);

  if (isErr(paddleCustomerId)) {
    return makeErr(
      si`Invalid stored data for account ${accountId.value}: ${paddleCustomerId.reason}`,
      'paddleCustomerId'
    );
  }

  const lastPaddlePlanEventAt = parseOptionalDate(item.lastPaddlePlanEventAt);

  if (isErr(lastPaddlePlanEventAt)) {
    return makeErr(
      si`Invalid stored data for account ${accountId.value}: ${lastPaddlePlanEventAt.reason}`,
      'lastPaddlePlanEventAt'
    );
  }

  return {
    planId,
    email,
    hashedPassword,
    creationTimestamp,
    confirmationTimestamp,
    isAdmin,
    passwordChangedAt,
    paddleCustomerId,
    lastPaddlePlanEventAt,
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
    isAdmin: account.isAdmin,
    passwordChangedAt: account.passwordChangedAt,
    paddleCustomerId: account.paddleCustomerId?.value,
    lastPaddlePlanEventAt: account.lastPaddlePlanEventAt,
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

  // The next account registered at this address gets the same ID, and must not
  // inherit secrets issued to this one. Revoke first: if it fails, nothing is gone
  // and the deletion can simply be retried.
  const revokeResult = revokeAccountSecrets(storage, accountId, allConfirmationSecretKinds);

  if (isErr(revokeResult)) {
    return makeErr(si`Failed to ${revokeAccountSecrets.name}: ${revokeResult.reason}`);
  }

  // Same reason, and same order: a live entry left behind would name the next account
  // registered at this address.
  const unlinkResult = unlinkPaddleCustomer(storage, accountId);

  if (isErr(unlinkResult)) {
    return makeErr(si`Failed to ${unlinkPaddleCustomer.name}: ${unlinkResult.reason}`);
  }

  const removeTreeResult = storage.removeTree(storageKey);

  if (isErr(removeTreeResult)) {
    return makeErr(si`Couldn’t removeTree: ${removeTreeResult.reason}`);
  }
}

export interface PaddleCustomerNotLinked {
  kind: 'PaddleCustomerNotLinked';
  isOfDeletedAccount: boolean;
}

export function isPaddleCustomerNotLinked(value: unknown): value is PaddleCustomerNotLinked {
  return hasKind(value, 'PaddleCustomerNotLinked');
}

// Webhooks arrive with only a customer ID, so an index maps it back to the account.
// An entry counts only when the account it names links the same customer back:
// account IDs are hashes of the address, so a stale entry would otherwise resolve
// to whoever registers that address next.
export function findAccountIdByPaddleCustomerId(
  storage: AppStorage,
  customerId: PaddleCustomerId
): Result<PaddleCustomerNotLinked | AccountId> {
  const notLinked: PaddleCustomerNotLinked = { kind: 'PaddleCustomerNotLinked', isOfDeletedAccount: false };
  const entry = loadPaddleCustomerIndexEntry(storage, customerId);

  if (isErr(entry)) {
    return entry;
  }

  if (!entry) {
    return notLinked;
  }

  const { accountId } = entry;
  const account = loadAccount(storage, accountId);

  if (isErr(account)) {
    return makeErr(si`Failed to ${loadAccount.name}: ${account.reason}`);
  }

  // Checked before the tombstone: a deletion that failed after writing it leaves an
  // account that still links back, and that one still gets its webhooks.
  if (!isAccountNotFound(account) && account.paddleCustomerId?.value === customerId.value) {
    return accountId;
  }

  return { ...notLinked, isOfDeletedAccount: !!entry.deletedAt };
}

// The index entry goes first: an entry whose account doesn’t link back is ignored,
// while an account field without its entry would leave webhooks unresolvable.
export function linkPaddleCustomer(
  storage: AppStorage,
  accountId: AccountId,
  customerId: PaddleCustomerId
): Result<AccountNotFound | void> {
  const account = loadAccount(storage, accountId);

  if (isErr(account) || isAccountNotFound(account)) {
    return account;
  }

  if (account.paddleCustomerId && account.paddleCustomerId.value !== customerId.value) {
    return makeErr(
      si`Account ${accountId.value} is already linked to ${account.paddleCustomerId.value}, not ${customerId.value}`
    );
  }

  const indexResult = storePaddleCustomerIndexEntry(storage, customerId, accountId);

  if (isErr(indexResult)) {
    return indexResult;
  }

  const storeResult = storeAccount(storage, accountId, { ...account, paddleCustomerId: customerId });

  if (isErr(storeResult)) {
    return makeErr(si`Failed to ${storeAccount.name}: ${storeResult.reason}`);
  }
}

// Leaves a tombstone rather than removing the entry. Deletion cancels the subscription
// at period end, so Paddle’s subscription.canceled arrives after the account is gone,
// and the webhook needs to tell that apart from a customer it has never heard of.
function unlinkPaddleCustomer(storage: AppStorage, accountId: AccountId): Result<void> {
  const account = loadAccount(storage, accountId);

  if (isErr(account)) {
    return makeErr(si`Failed to ${loadAccount.name}: ${account.reason}`);
  }

  if (isAccountNotFound(account) || !account.paddleCustomerId) {
    return;
  }

  const entry = loadPaddleCustomerIndexEntry(storage, account.paddleCustomerId);

  if (isErr(entry)) {
    return entry;
  }

  if (entry?.accountId.value !== accountId.value) {
    return;
  }

  return storePaddleCustomerIndexEntry(storage, account.paddleCustomerId, accountId, new Date());
}

interface PaddleCustomerIndexEntry {
  accountId: AccountId;
  deletedAt: Date | undefined;
}

function storePaddleCustomerIndexEntry(
  storage: AppStorage,
  customerId: PaddleCustomerId,
  accountId: AccountId,
  deletedAt?: Date
): Result<void> {
  const storageKey = getPaddleCustomerIndexStorageKey(customerId);
  const storeResult = storage.storeItem(storageKey, { accountId: accountId.value, deletedAt });

  if (isErr(storeResult)) {
    return makeErr(si`Failed to store the Paddle customer index entry: ${storeResult.reason}`);
  }
}

function loadPaddleCustomerIndexEntry(
  storage: AppStorage,
  customerId: PaddleCustomerId
): Result<PaddleCustomerIndexEntry | undefined> {
  const storageKey = getPaddleCustomerIndexStorageKey(customerId);
  const exists = storage.hasItem(storageKey);

  if (isErr(exists)) {
    return makeErr(si`Failed to check the Paddle customer index entry: ${exists.reason}`);
  }

  if (!exists) {
    return;
  }

  const item = storage.loadItem(storageKey);

  if (isErr(item)) {
    return makeErr(si`Failed to load the Paddle customer index entry: ${item.reason}`);
  }

  const accountId = makeAccountId(item?.accountId);

  if (isErr(accountId)) {
    return makeErr(si`Invalid Paddle customer index entry for ${customerId.value}: ${accountId.reason}`);
  }

  const deletedAt = parseOptionalDate(item?.deletedAt);

  if (isErr(deletedAt)) {
    return makeErr(si`Invalid Paddle customer index entry for ${customerId.value}: ${deletedAt.reason}`);
  }

  return { accountId, deletedAt };
}

export const paddleCustomersStorageKey = '/paddle-customers';

function getPaddleCustomerIndexStorageKey(customerId: PaddleCustomerId): StorageKey {
  return makePath(paddleCustomersStorageKey, si`${customerId.value}.json`);
}

export function resetAccountPassword(
  storage: AppStorage,
  accountId: AccountId,
  newHashedPassword: HashedPassword
): Result<void> {
  const account = loadAccount(storage, accountId);

  if (isErr(account)) {
    return makeErr(si`Failed to ${loadAccount.name}: ${account.reason}`);
  }

  if (isAccountNotFound(account)) {
    return makeErr('Account not found');
  }

  const storeResult = storeAccount(storage, accountId, {
    ...account,
    hashedPassword: newHashedPassword,
    passwordChangedAt: new Date(),
  });

  if (isErr(storeResult)) {
    return makeErr(si`Failed to ${storeAccount.name}: ${storeResult.reason}`);
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
