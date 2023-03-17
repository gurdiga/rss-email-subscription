import { CronCommand, CronJob } from 'cron';
import { AppEnv } from '../api/init-app';
import { sendEmails } from '../app/email-sending';
import { checkRss } from '../app/rss-checking';
import { isAccountNotFound, makeAccountId } from '../domain/account';
import { accountsStorageKey, loadAccount } from '../domain/account-storage';
import { FeedStatus } from '../domain/feed';
import { loadFeedsByAccountId } from '../domain/feed-storage';
import { makeStorage } from '../domain/storage';
import { isEmpty, isNotEmpty } from '../shared/array-utils';
import { requireEnv } from '../shared/env';
import { AnyAsyncFunction, isErr } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { si } from '../shared/string-utils';

function main() {
  const { logError, logInfo, logWarning } = makeCustomLoggers({ module: 'cron' });

  logInfo(si`Starting cron in ${process.env['NODE_ENV']!} environment`);

  const env = requireEnv<AppEnv>(['DATA_DIR_ROOT', 'DOMAIN_NAME']);

  if (isErr(env)) {
    logError('Invalid environment', { reason: env.reason });
    return;
  }

  const dataDirRoot = env.DATA_DIR_ROOT;
  const feedCheckingJob = startJob('0 * * * *', () => checkFeeds(dataDirRoot));
  const errorReportingCheckJob = startJob('0 0 * * *', () => logError('Just checking error reporting'));

  process.on('SIGHUP', () => {
    logWarning('Received SIGUP. Will check feeds now.');
    checkFeeds(dataDirRoot);
  });

  process.on('SIGTERM', () => {
    logWarning('Received SIGTERM. Will stop the cron job and exit.');
    feedCheckingJob.stop();
    errorReportingCheckJob.stop();
  });
}

async function checkFeeds(dataDirRoot: string): Promise<void> {
  const logData = { module: 'cron' };

  logDuration('Feed checking', logData, async () => {
    const { logError, logInfo } = makeCustomLoggers(logData);
    const storage = makeStorage(dataDirRoot);
    const accountDirs = storage.listSubdirectories(accountsStorageKey);

    if (isErr(accountDirs)) {
      logError('Failed to list account subdirectories', { reason: accountDirs.reason });
      process.exit(1);
    }

    if (isEmpty(accountDirs)) {
      logError('No accounts?!', { dataDirRoot });
      process.exit(1);
    }

    for (const dirName of accountDirs) {
      const accountId = makeAccountId(dirName);

      if (isErr(accountId)) {
        logError(si`Failed to ${makeAccountId.name}`, { input: dirName, reason: accountId.reason });
        continue;
      }

      const account = loadAccount(storage, accountId);

      if (isErr(account)) {
        logError(si`Failed to ${loadAccount.name}`, { accountId: accountId.value, reason: account.reason });
        continue;
      }

      if (isAccountNotFound(account)) {
        logError('Account not found', { accountId: accountId.value });
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

      logInfo('Counting feeds', { ...logData, feedCount: approvedFeeds.length });

      for (const feed of approvedFeeds) {
        const feedLogData = { ...logData, displayName: feed.displayName, feedId: feed.id.value };

        await logDuration('RSS checking', feedLogData, () => checkRss(accountId, feed, storage));
        await logDuration('Email sending', feedLogData, () => sendEmails(accountId, feed, storage));
      }
    }
  });
}

async function logDuration(label: string, logData: object, f: AnyAsyncFunction): Promise<void> {
  let { logInfo } = makeCustomLoggers(logData);
  const startTimestamp = new Date();

  logInfo(si`Started ${label}`);
  await f();

  const endTimestamp = new Date();
  const durationMs = endTimestamp.valueOf() - startTimestamp.valueOf();

  logInfo(si`Finished ${label}`, { durationMs });
}

function startJob(cronTime: string, onTick: CronCommand): CronJob {
  const startNow = true;
  const onComplete = null;

  return new CronJob(cronTime, onTick, onComplete, startNow);
}

main();
