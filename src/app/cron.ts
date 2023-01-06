import { CronJob } from 'cron';
import { checkRss } from '../app/rss-checking';
import { sendEmails } from '../app/email-sending';
import { makeCustomLoggers } from '../shared/logging';
import { loadFeedsByAccountId } from '../domain/feed';
import { isErr } from '../shared/lang';
import { AppStorage, makeStorage } from '../shared/storage';
import { requireEnv } from '../shared/env';
import { AppEnv } from '../api/init-app';
import { accountsStorageKey, makeAccountId } from '../domain/account';
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
  const storage = makeStorage(dataDirRoot);
  let cronJobs = scheduleFeedChecks(env, storage);

  process.on('SIGHUP', () => {
    logWarning('Received SIGUP. Will reload.');

    cronJobs.forEach((j) => j.stop());
    cronJobs = scheduleFeedChecks(env, storage);
  });

  process.on('SIGTERM', () => {
    logWarning('Received SIGTERM. Will stop all the cron jobs and exit.');
    [...cronJobs, errorReportingCheck].forEach((j) => j.stop());
  });

  const errorReportingCheck = scheduleErrorReportingCheck();
}

function scheduleFeedChecks(env: AppEnv, storage: AppStorage): CronJob[] {
  const { logError, logInfo } = makeCustomLoggers({ module: 'cron' });
  let accountDirs = storage.listSubdirectories(accountsStorageKey);

  if (isErr(accountDirs)) {
    logError('Failed to list account subdirectories', { reason: accountDirs.reason });
    process.exit(1);
  }

  if (accountDirs.length === 0) {
    logError('No accountDirs in dataDirRoot', { dataDirRoot: env.DATA_DIR_ROOT });
    process.exit(1);
  }

  const cronJobs: CronJob[] = [];

  for (const dirName of accountDirs) {
    const accountId = makeAccountId(dirName);

    if (isErr(accountId)) {
      logError('Invalid accountId', { dirName, reason: accountId.reason });
      continue;
    }

    const feedsByAccountId = loadFeedsByAccountId(accountId, storage);

    if (isErr(feedsByAccountId)) {
      logError(si`Failed to ${loadFeedsByAccountId.name}`, { dirName, reason: feedsByAccountId.reason });
      continue;
    }

    if (feedsByAccountId.errs.length > 0) {
      logError(si`Errors on ${loadFeedsByAccountId.name}: ${feedsByAccountId.errs.join()}`, { dirName });
    }

    for (const feed of feedsByAccountId.validFeeds) {
      logInfo('Scheduling feed check', { feed });

      cronJobs.push(
        new CronJob(feed.cronPattern.value, async () => {
          await checkRss(accountId, feed, storage);
          await sendEmails(accountId, feed, storage);
        })
      );
    }
  }

  cronJobs.forEach((j) => j.start());

  return cronJobs;
}

function scheduleErrorReportingCheck(): CronJob {
  const { logError, logWarning } = makeCustomLoggers({ module: 'error-reporting-check' });

  logWarning('Starting a daily job to check error reporting');

  const job = new CronJob('0 0 * * *', async () => {
    logError('Just checking error reporting');
  });

  job.start();

  return job;
}

main();
