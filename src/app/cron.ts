import { CronJob } from 'cron';
import { checkRss } from '../app/rss-checking';
import { sendEmails } from '../app/email-sending';
import { makeCustomLoggers } from '../shared/logging';
import { feedRootStorageKey, getFeed, makeFeedId } from '../domain/feed';
import { isErr } from '../shared/lang';
import { AppStorage, makeStorage } from '../shared/storage';
import { requireEnv } from '../shared/env';
import { AppEnv } from '../api/init-app';

function main() {
  const { logError, logInfo, logWarning } = makeCustomLoggers({ module: 'cron' });

  logInfo('Starting cron');

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
    logInfo('Received SIGTERM. Will stop all the cron jobs and exit.');
    [...cronJobs, errorReportingCheck].forEach((j) => j.stop());
  });

  const errorReportingCheck = scheduleErrorReportingCheck();
}

function scheduleFeedChecks(env: AppEnv, storage: AppStorage): CronJob[] {
  const { logError, logInfo } = makeCustomLoggers({ module: 'cron' });
  let feedDirs = storage.listSubdirectories(feedRootStorageKey);

  if (isErr(feedDirs)) {
    logError(`Failed to list feed subdirectories`, { reason: feedDirs.reason });
    process.exit(1);
  }

  if (feedDirs.length === 0) {
    logError(`No feedDirs in dataDirRoot`, { dataDirRoot: env.DATA_DIR_ROOT });
    process.exit(1);
  }

  const cronJobs: CronJob[] = [];

  for (const dirName of feedDirs) {
    const feedId = makeFeedId(dirName);

    if (isErr(feedId)) {
      logError(`Invalid feed ID`, { dirName, reason: feedId.reason });
      continue;
    }

    const feed = getFeed(feedId, storage, env.DOMAIN_NAME);

    if (isErr(feed)) {
      logError(`Invalid feed settings`, { feedId, reason: feed.reason });
      continue;
    }

    if (feed.kind === 'FeedNotFound') {
      logError('feed.json not found?!', { feedId });
      continue;
    }

    const { cronPattern } = feed;

    logInfo(`Scheduling feed check`, { feedId, feed });

    cronJobs.push(
      new CronJob(cronPattern, async () => {
        await checkRss(feedId, feed, storage);
        await sendEmails(feedId, feed, storage);
      })
    );
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
