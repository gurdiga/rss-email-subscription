import { CronJob } from 'cron';
import { readdirSync } from 'fs';
import path from 'path';
import { main as checkRss } from './rss-checking';
import { main as sendEmails } from './email-sending';
import { logError, logInfo } from './shared/logging';
import { getFeedSettings } from './shared/feed-settings';
import { isErr } from './shared/lang';
import { makeDataDir } from './shared/data-dir';

function main() {
  const dataDirRoot = process.env.DATA_DIR_ROOT;

  if (!dataDirRoot) {
    logError(`DATA_DIR_ROOT envar missing`);
    return;
  }

  let cronJobs = scheduleFeedChecks(dataDirRoot);

  process.on('SIGHUP', () => {
    logInfo('Received SIGUP. Will reload.');

    cronJobs.forEach((j) => j.stop());
    cronJobs = scheduleFeedChecks(dataDirRoot);
  });
}

function scheduleFeedChecks(dataDirRoot: string): CronJob[] {
  const dataDirs = readdirSync(dataDirRoot, { withFileTypes: true }).filter((x) => x.isDirectory());

  if (dataDirs.length === 0) {
    logError(`No dataDirs in dataDirRoot`, { dataDirRoot });
    return [];
  }

  const cronJobs: CronJob[] = [];

  for (const { name } of dataDirs) {
    const cronPattern = '0 * * * *';
    const dataDirString = path.join(dataDirRoot, name);
    const dataDir = makeDataDir(dataDirString);

    if (isErr(dataDir)) {
      logError(`Invalid dataDir`, { dataDirString, reason: dataDir.reason });
      continue;
    }

    logInfo(`Scheduling feed check for ${dataDirString}`, { cronPattern });

    cronJobs.push(
      new CronJob(cronPattern, async () => {
        const feedSettings = getFeedSettings(dataDir);

        if (isErr(feedSettings)) {
          logError(`Invalid feed settings`, { dataDirString, reason: feedSettings.reason });
          return;
        }

        await checkRss(dataDir, feedSettings);
        await sendEmails(dataDir, feedSettings);
      })
    );
  }

  cronJobs.forEach((j) => j.start());

  return cronJobs;
}

main();
