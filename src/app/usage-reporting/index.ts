import { AccountId, isAccountNotFound } from '../../domain/account';
import { getAllAccountIds, loadAccount } from '../../domain/account-storage';
import { FeedStatus } from '../../domain/feed';
import { FeedId } from '../../domain/feed-id';
import { loadFeedsByAccountId } from '../../domain/feed-storage';
import { AppStorage } from '../../domain/storage';
import { isEmpty, isNotEmpty } from '../../shared/array-utils';
import { getDeliveryDirPrefix, getYesterday } from '../../shared/date-utils';
import { Result, asyncAttempt, isErr, makeErr } from '../../shared/lang';
import { logDuration, makeCustomLoggers } from '../../shared/logging';
import { makePath } from '../../shared/path-utils';
import { si } from '../../shared/string-utils';
import { catchAllItemCount, getDeliveriesRootStorageKey } from '../email-sending/item-delivery';
import { isPaidPlan } from '../../domain/plan';
import { getStripeSubscriptionItemStorageKey, makeStripe } from '../../api/stripe-integration';

export function reportUsage(storage: AppStorage, stripeSecretKey: string): void {
  const logData = { module: reportUsage.name };

  logDuration('Usage reporting', logData, async () => {
    const { logError, logInfo } = makeCustomLoggers(logData);
    const accountIds = getAllAccountIds(storage);

    if (isErr(accountIds)) {
      logError(si`Failed to ${getAllAccountIds.name}`, { reason: accountIds.reason });
      return;
    }

    for (const accountId of accountIds) {
      const account = loadAccount(storage, accountId);

      if (isErr(account)) {
        logError(si`Failed to ${loadAccount.name}: ${account.reason}`, { ...logData, accountId: accountId.value });
        continue;
      }

      if (isAccountNotFound(account)) {
        logError(si`Account not found when reporting usage`, { ...logData, accountId: accountId.value });
        continue;
      }

      if (!isPaidPlan(account.planId)) {
        continue;
      }

      const feeds = loadFeedsByAccountId(accountId, storage);

      if (isErr(feeds)) {
        logError(si`Failed to ${loadFeedsByAccountId.name}`, { ...logData, reason: feeds.reason });
        continue;
      }

      if (isNotEmpty(feeds.errs)) {
        const errs = feeds.errs.map((x) => x.reason);
        logError(si`Errors on ${loadFeedsByAccountId.name}`, { ...logData, errs });
      }

      if (isEmpty(feeds.validFeeds)) {
        continue;
      }

      const approvedFeeds = feeds.validFeeds.filter((x) => x.status === FeedStatus.Approved && !x.isDeleted);
      const yesterday = getYesterday();
      const totalItems = approvedFeeds.reduce((total, feed) => {
        const itemCount = getItemCountRecursively(storage, accountId, feed.id, yesterday);

        if (isErr(itemCount)) {
          logError(si`Errors on ${getItemCountRecursively.name}: ${itemCount.reason}`);
          return total;
        }

        if (itemCount > 0) {
          logInfo('Items delivered on date', {
            date: yesterday,
            accountId: accountId.value,
            feedId: feed.id.value,
            itemCount,
          });
        }

        return total + itemCount;
      }, 0);

      if (totalItems === 0) {
        continue;
      }

      await logDuration(
        'Reporting usage to Stripe',
        { ...logData, date: yesterday, accountId: accountId.value, totalItems },
        async () => {
          const response = await reportUsageToStripe(storage, stripeSecretKey, accountId, totalItems, yesterday);

          if (isErr(response)) {
            logError(si`Failed to ${reportUsageToStripe.name}: ${response.reason}`);
          }
        }
      );
    }
  });
}

function getItemCountRecursively(
  storage: AppStorage,
  accountId: AccountId,
  feedId: FeedId,
  date: Date
): Result<number> {
  const deliveriesStorageKey = getDeliveriesRootStorageKey(accountId, feedId);
  const deliveriesDirExists = storage.hasItem(deliveriesStorageKey);

  if (isErr(deliveriesDirExists)) {
    return makeErr(si`Failed to check if deliveries dir exists: ${deliveriesDirExists.reason}`);
  }

  if (deliveriesDirExists === false) {
    return 0;
  }

  const deliveryDirs = storage.listSubdirectories(deliveriesStorageKey);

  if (isErr(deliveryDirs)) {
    return makeErr(si`Failed to list delivery subdirs for feed ${feedId.value}: ${deliveryDirs.reason}`);
  }

  const deliveryDirPrefix = getDeliveryDirPrefix(date);
  const dateDeliveryDirs = deliveryDirs.filter((x) => x.startsWith(deliveryDirPrefix));

  let total = 0;

  for (const deliveryDir of dateDeliveryDirs) {
    const deliveryRootStorageKey = makePath(deliveriesStorageKey, deliveryDir);
    const statusDirs = storage.listSubdirectories(deliveryRootStorageKey);

    if (isErr(statusDirs)) {
      return makeErr(
        si`Failed to list status subdirs for delivery ${feedId.value}/${deliveryDir}: ${statusDirs.reason}`
      );
    }

    for (const statusDir of statusDirs) {
      const deliveryStorageKey = makePath(deliveryRootStorageKey, statusDir);
      const items = storage.listItems(deliveryStorageKey);

      if (isErr(items)) {
        return makeErr(si`Failed to list items in ${feedId.value}/${deliveryDir}/${statusDir}: ${items.reason}`);
      }

      total += items.length - catchAllItemCount;
    }
  }

  return total;
}

export async function reportUsageToStripe(
  storage: AppStorage,
  secretKey: string,
  accountId: AccountId,
  quantity: number,
  usageDate: Date
): Promise<Result<void>> {
  const stripe = makeStripe(secretKey);
  const subscriptionItemId = loadSubscriptionItemId(storage, accountId);

  if (isErr(subscriptionItemId)) {
    return makeErr(si`Failed to ${loadSubscriptionItemId.name}: ${subscriptionItemId.reason}`);
  }

  const dateOnly = usageDate.toISOString().substring(0, 10);
  const idempotencyKey = accountId.value + '-' + dateOnly;

  const result = await asyncAttempt(() =>
    stripe.subscriptionItems.createUsageRecord(
      // prettier: keep these stacked
      subscriptionItemId,
      { action: 'set', quantity },
      { idempotencyKey }
    )
  );

  if (isErr(result)) {
    return makeErr(si`Failed to stripe.subscriptionItems.createUsageRecord: ${result.reason}`);
  }
}

function loadSubscriptionItemId(storage: AppStorage, accountId: AccountId): Result<string> {
  const storageKey = getStripeSubscriptionItemStorageKey(accountId);

  return storage.loadItem(storageKey);
}
