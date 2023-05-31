import { CronCommand, CronJob } from 'cron';
import { AppEnv } from '../api/init-app';
import { sendEmails } from '../app/email-sending';
import { checkRss } from '../app/rss-checking';
import { AccountId, isAccountNotFound } from '../domain/account';
import { getAllAccountIds, loadAccount } from '../domain/account-storage';
import { FeedStatus } from '../domain/feed';
import { FeedId } from '../domain/feed-id';
import { loadFeedsByAccountId } from '../domain/feed-storage';
import { AppStorage, makeStorage } from '../domain/storage';
import { isEmpty, isNotEmpty } from '../shared/array-utils';
import { getDeliveryDirPrefix, getYesterday } from '../shared/date-utils';
import { requireEnv } from '../shared/env';
import { Result, isErr, makeErr } from '../shared/lang';
import { logDuration, makeCustomLoggers } from '../shared/logging';
import { makePath } from '../shared/path-utils';
import { si } from '../shared/string-utils';
import { getDeliveriesRootStorageKey } from './email-sending/item-delivery';
import { isPaidPlan } from '../domain/plan';

function main() {
  const { logError, logInfo, logWarning } = makeCustomLoggers({ module: 'cron' });

  logInfo(si`Starting cron in ${process.env['NODE_ENV']!} environment`);

  const env = requireEnv<AppEnv>(['DATA_DIR_ROOT', 'DOMAIN_NAME', 'STRIPE_SECRET_KEY']);

  if (isErr(env)) {
    logError('Invalid environment', { reason: env.reason });
    return;
  }

  const dataDirRoot = env.DATA_DIR_ROOT;
  const storage = makeStorage(dataDirRoot);

  const feedCheckingJob = startJob('2 * * * *', () => checkFeeds(storage));
  // TODO: Change schedule from hourly to midnight when dev done.
  const usageReportingJob = startJob('1 * * * *', () => reportUsage(storage, env.STRIPE_SECRET_KEY));
  const errorReportingCheckJob = startJob('0 0 * * *', () => logError('Just checking error reporting'));

  process.on('SIGHUP', () => {
    logWarning('Received SIGUP. Will check feeds now.');
    checkFeeds(storage);
    reportUsage(storage, env.STRIPE_SECRET_KEY);
  });

  process.on('SIGTERM', () => {
    logWarning('Received SIGTERM. Will stop the cron job and exit.');
    feedCheckingJob.stop();
    usageReportingJob.stop();
    errorReportingCheckJob.stop();
  });
}

function reportUsage(storage: AppStorage, _stripeSecretKey: string): void {
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
        logInfo('No feeds for account', { ...logData, accountId: accountId.value });
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

      logInfo('Reporting usage to Stripe', { date: yesterday, accountId: accountId.value, totalItems });
      // TODO: Uncomment this after a test run
      // reportUsageToStripe(storage, stripeSecretKey, accountId, quantity);
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

      total += items.length;
    }
  }

  return total;
}

async function checkFeeds(storage: AppStorage): Promise<void> {
  const logData = { module: checkFeeds.name };

  logDuration('Feed checking', logData, async () => {
    const { logError, logInfo } = makeCustomLoggers(logData);
    const accountIds = getAllAccountIds(storage);

    if (isErr(accountIds)) {
      logError(si`Failed to ${getAllAccountIds.name}`, { reason: accountIds.reason });
      return;
    }

    for (const accountId of accountIds) {
      const account = loadAccount(storage, accountId);

      if (isErr(account)) {
        logError(si`Failed to ${loadAccount.name}`, { accountId: accountId.value, reason: account.reason });
        continue;
      }

      if (isAccountNotFound(account)) {
        logError('Account file not found', { accountId: accountId.value });
        continue;
      }

      const logData = {
        accountEmail: account.email.value,
        accountId: accountId.value,
      };
      const feedsByAccountId = loadFeedsByAccountId(accountId, storage);

      if (isErr(feedsByAccountId)) {
        logError(si`Failed to ${loadFeedsByAccountId.name}`, { ...logData, reason: feedsByAccountId.reason });
        continue;
      }

      if (isNotEmpty(feedsByAccountId.errs)) {
        const errs = feedsByAccountId.errs.map((x) => x.reason);
        logError(si`Errors on ${loadFeedsByAccountId.name}`, { ...logData, errs });
      }

      if (isEmpty(feedsByAccountId.validFeeds)) {
        logInfo('No feeds for account', { ...logData, accountId: accountId.value });
        continue;
      }

      const approvedFeeds = feedsByAccountId.validFeeds.filter((x) => x.status === FeedStatus.Approved && !x.isDeleted);

      logInfo('Counting approved feeds', { ...logData, feedCount: approvedFeeds.length });

      for (const feed of approvedFeeds) {
        const feedLogData = { ...logData, displayName: feed.displayName, feedId: feed.id.value };

        await logDuration('RSS checking', feedLogData, () => checkRss(accountId, feed, storage));
        await logDuration('Email sending', feedLogData, () => sendEmails(accountId, feed, storage));
      }
    }
  });
}

function startJob(cronTime: string, workerFn: CronCommand): CronJob {
  const startNow = true;
  const onComplete = null;

  return new CronJob(cronTime, workerFn, onComplete, startNow);
}

main();
