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
import { getYestedayAsIsoString } from '../shared/date-utils';
import { requireEnv } from '../shared/env';
import { Result, isErr, makeErr } from '../shared/lang';
import { logDuration, makeCustomLoggers } from '../shared/logging';
import { makePath } from '../shared/path-utils';
import { si } from '../shared/string-utils';
import { getDeliveriesRootStorageKey } from './email-sending/item-delivery';

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
  const usageReportingJob = startJob('1 0 * * *', () => reportUsage(storage, env.STRIPE_SECRET_KEY));
  const errorReportingCheckJob = startJob('0 0 * * *', () => logError('Just checking error reporting'));

  process.on('SIGHUP', () => {
    logWarning('Received SIGUP. Will check feeds now.');
    checkFeeds(storage);
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
      logError('Failed to list all account IDs', { reason: accountIds.reason });
      return;
    }

    for (const accountId of accountIds) {
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
        logInfo('No feeds for account', logData);
      }

      const approvedFeeds = feedsByAccountId.validFeeds.filter((x) => x.status === FeedStatus.Approved && !x.isDeleted);
      const yesterday = getYestedayAsIsoString();
      const quantity = approvedFeeds.reduce((total, feed) => {
        const itemCount = getItemCountRecursively(storage, accountId, feed.id, yesterday);

        if (isErr(itemCount)) {
          logError(si`Errors on ${getItemCountRecursively.name}: ${itemCount.reason}`);
          return total;
        }

        return total + itemCount;
      }, 0);

      if (quantity === 0) {
        continue;
      }

      logInfo('Reporting usage to Stripe', { accountId: accountId.value, yesterday, quantity });
      // TODO: Uncomment this after a test run
      // reportUsageToStripe(storage, stripeSecretKey, accountId, quantity);
    }
  });
}

function getItemCountRecursively(
  storage: AppStorage,
  accountId: AccountId,
  feedId: FeedId,
  deliveryDate: string
): Result<number> {
  const deliveriesStorageKey = getDeliveriesRootStorageKey(accountId, feedId);
  const statusSubdirs = storage.listSubdirectories(deliveriesStorageKey);

  if (isErr(statusSubdirs)) {
    return makeErr(si`Failed to list delivery status subdirs for feed ${feedId.value}: ${statusSubdirs.reason}`);
  }

  let total = 0;

  for (const statusSubdir of statusSubdirs) {
    const statusSubdirStorageKey = makePath(deliveriesStorageKey, statusSubdir);
    const deliverySubdirs = storage.listSubdirectories(statusSubdirStorageKey);

    if (isErr(deliverySubdirs)) {
      return makeErr(
        si`Failed to list delivery status subdir "${statusSubdir}" for feed ${feedId.value}: ${deliverySubdirs.reason}`
      );
    }

    const dateDeliveriesSubdirs = deliverySubdirs.filter((x) => x.startsWith(deliveryDate));

    for (const deliverySubdir of dateDeliveriesSubdirs) {
      const deliveryStorageKey = makePath(statusSubdirStorageKey, deliverySubdir);
      const items = storage.listItems(deliveryStorageKey);

      if (isErr(items)) {
        return makeErr(
          si`Failed to list delivery items in ${feedId.value}/${statusSubdir}/${deliverySubdir}: ${items.reason}`
        );
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
      logError('Failed to list all account IDs', { reason: accountIds.reason });
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
        logInfo('No feeds for account', logData);
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

function startJob(cronTime: string, onTick: CronCommand): CronJob {
  const startNow = true;
  const onComplete = null;

  return new CronJob(cronTime, onTick, onComplete, startNow);
}

main();
