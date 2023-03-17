import { CronCommand, CronJob } from 'cron';
import { AppEnv } from '../api/init-app';
import { sendEmails } from '../app/email-sending';
import { checkRss } from '../app/rss-checking';
import { makeAccountId } from '../domain/account';
import { accountsStorageKey } from '../domain/account-storage';
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
  const loggers = makeCustomLoggers(logData);

  logDuration('Feed checking', loggers, async () => {
    const { logError, logInfo } = loggers;
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

      const feedsByAccountId = loadFeedsByAccountId(accountId, storage);

      if (isErr(feedsByAccountId)) {
        logError(si`Failed to ${loadFeedsByAccountId.name}`, {
          accountId: accountId.value,
          reason: feedsByAccountId.reason,
        });
        continue;
      }

      if (isNotEmpty(feedsByAccountId.errs)) {
        const errs = feedsByAccountId.errs.map((x) => x.reason);
        logError(si`Errors on ${loadFeedsByAccountId.name}`, { accountId: accountId.value, errs });
      }

      if (isEmpty(feedsByAccountId.validFeeds)) {
        logInfo('No feeds for account', { accountId: accountId.value });
      }

      const approvedFeeds = feedsByAccountId.validFeeds.filter((x) => x.status === FeedStatus.Approved && !x.isDeleted);
      const feedCount = approvedFeeds.length;

      logInfo(si`Checking ${feedCount} feeds`, { accountId: accountId.value });

      for (const feed of approvedFeeds) {
        const logLabel = si`${feed.displayName} (${feed.id.value})`;

        await logDuration(si`RSS checking: ${logLabel}`, loggers, () => checkRss(accountId, feed, storage));
        await logDuration(si`Email sending: ${logLabel}`, loggers, () => sendEmails(accountId, feed, storage));
      }
    }
  });
}

async function logDuration(
  label: string,
  { logInfo }: ReturnType<typeof makeCustomLoggers>,
  f: AnyAsyncFunction
): Promise<void> {
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
