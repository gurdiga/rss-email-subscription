import { CronJob } from 'cron';
import { readdirSync } from 'fs';
import path from 'path';
import { checkRss } from '../app/rss-checking';
import { sendEmails } from '../app/email-sending';
import { makeCustomLoggers } from '../shared/logging';
import { getFeedSettings } from '../shared/feed-settings';
import { isErr } from '../shared/lang';
import { makeDataDir } from '../shared/data-dir';
import { AppStorage, makeStorage } from '../shared/storage';

function main() {
  const { logError, logInfo, logWarning } = makeCustomLoggers({ module: 'cron' });

  logInfo('Starting cron');

  const dataDirRoot = process.env['DATA_DIR_ROOT'];

  if (!dataDirRoot) {
    logError(`DATA_DIR_ROOT envar missing`);
    return;
  }

  const storage = makeStorage(dataDirRoot);
  let cronJobs = scheduleFeedChecks(dataDirRoot, storage);

  process.on('SIGHUP', () => {
    logWarning('Received SIGUP. Will reload.');

    cronJobs.forEach((j) => j.stop());
    cronJobs = scheduleFeedChecks(dataDirRoot, storage);
  });

  process.on('SIGTERM', () => {
    console.info('Received SIGTERM. Will shut down.');
  });

  scheduleErrorReportingCheck();
}

function scheduleFeedChecks(dataDirRoot: string, storage: AppStorage): CronJob[] {
  const { logError, logInfo } = makeCustomLoggers({ module: 'cron' });
  const dataDirs = readdirSync(dataDirRoot, { withFileTypes: true }).filter((x) => x.isDirectory());

  if (dataDirs.length === 0) {
    logError(`No dataDirs in dataDirRoot`, { dataDirRoot });
    return [];
  }

  const cronJobs: CronJob[] = [];

  for (const { name } of dataDirs) {
    const dataDirString = path.join(dataDirRoot, name);
    const dataDir = makeDataDir(dataDirString);

    if (isErr(dataDir)) {
      logError(`Invalid dataDir`, { dataDirString, reason: dataDir.reason });
      continue;
    }

    const feedSettings = getFeedSettings(name, storage);

    if (isErr(feedSettings)) {
      logError(`Invalid feed settings`, { dataDirString, reason: feedSettings.reason });
      continue;
    }

    if (feedSettings.kind === 'FeedNotFound') {
      logError('Feed not found', { dataDir });
      continue;
    }

    const { cronPattern } = feedSettings;

    logInfo(`Scheduling feed check`, { dataDirString, feedSettings });

    cronJobs.push(
      new CronJob(cronPattern, async () => {
        await checkRss(name, feedSettings, storage);
        await sendEmails(name, feedSettings, storage);
      })
    );
  }

  cronJobs.forEach((j) => j.start());

  return cronJobs;
}

function scheduleErrorReportingCheck() {
  const { logError, logWarning } = makeCustomLoggers({ module: 'error-reporting-check' });

  logWarning('Starting a daily job to check error reporting');

  new CronJob('0 0 * * *', async () => {
    logError('Just checking error reporting');
  }).start();
}

main();
