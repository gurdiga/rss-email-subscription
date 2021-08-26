import { CronJob } from 'cron';
import { main as checkRss } from './rss-checking/main';
import { logError } from './shared/logging';

function main() {
  const dataDir = process.env.DATA_DIR;

  if (!dataDir) {
    logError(`DATA_DIR envar missing`);
    return;
  }

  schedule('*/10 * * * * *', () => checkRss(dataDir));
}

function schedule(cronPattern: string, job: () => void): void {
  new CronJob(cronPattern, job).start();
}

main();
