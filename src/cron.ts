import { CronJob } from 'cron';
import { readdirSync } from 'fs';
import path from 'path';
import { main as checkRss } from './rss-checking/main';
import { main as sendEmails } from './email-sending/main';
import { logError, logInfo } from './shared/logging';

function main() {
  const dataDirRoot = process.env.DATA_DIR_ROOT;

  if (!dataDirRoot) {
    logError(`DATA_DIR_ROOT envar missing`);
    return;
  }

  const dataDirs = readdirSync(dataDirRoot, { withFileTypes: true }).filter((x) => x.isDirectory());

  if (dataDirs.length === 0) {
    logError(`No dataDirs in dataDirRoot`, { dataDirRoot });
    return;
  }

  for (const { name } of dataDirs) {
    const dataDir = path.join(dataDirRoot, name);
    const cronPattern = '0 * * * *';

    logInfo(`Scheduling processing for ${dataDir}`, { cronPattern });

    schedule(cronPattern, () => {
      checkRss(dataDir);
      sendEmails(dataDir);
    });
  }
}

function schedule(cronPattern: string, job: () => void): void {
  // TODO: Consider limiting the level of parallelisation if/when needed.
  new CronJob(cronPattern, job).start();
}

main();
