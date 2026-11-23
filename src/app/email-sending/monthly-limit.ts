import { AccountId } from '../../domain/account';
import { getAccountRootStorageKey } from '../../domain/account-storage';
import { AppStorage, StorageKey } from '../../domain/storage';
import { Result, isErr, makeErr, makeNumber } from '../../shared/lang';
import { makePath } from '../../shared/path-utils';
import { si } from '../../shared/string-utils';

export interface MonthlyEmailUsage {
  sentCount: number;
}

export function recordSentEmails(
  storage: AppStorage,
  accountId: AccountId,
  emailCount: number,
  now: Date
): Result<void> {
  if (emailCount === 0) {
    return;
  }

  const usage = loadMonthlyEmailUsage(storage, accountId, now);

  if (isErr(usage)) {
    return makeErr(si`Failed to ${loadMonthlyEmailUsage.name}: ${usage.reason}`);
  }

  return storeMonthlyEmailUsage(storage, accountId, { ...usage, sentCount: usage.sentCount + emailCount }, now);
}

export function loadMonthlyEmailUsage(storage: AppStorage, accountId: AccountId, now: Date): Result<MonthlyEmailUsage> {
  const storageKey = getMonthlyEmailUsageStorageKey(accountId, now);
  const exists = storage.hasItem(storageKey);

  if (isErr(exists)) {
    return makeErr(si`Failed to check if exists: ${exists.reason}`);
  }

  if (exists === false) {
    return { sentCount: 0 };
  }

  const data = storage.loadItem(storageKey);

  if (isErr(data)) {
    return makeErr(si`Failed to load: ${data.reason}`);
  }

  const sentCount = makeNumber(data.sentCount, 'sentCount');

  if (isErr(sentCount)) {
    return sentCount;
  }

  return { sentCount };
}

function storeMonthlyEmailUsage(
  storage: AppStorage,
  accountId: AccountId,
  usage: MonthlyEmailUsage,
  now: Date
): Result<void> {
  return storage.storeItem(getMonthlyEmailUsageStorageKey(accountId, now), usage);
}

export function getMonthlyEmailUsageStorageKey(accountId: AccountId, now: Date): StorageKey {
  return makePath(getAccountRootStorageKey(accountId), 'email-usage', si`${getUtcMonth(now)}.json`);
}

export function getUtcMonth(date: Date): string {
  return date.toISOString().substring(0, 7); // 'YYYY-MM'
}
