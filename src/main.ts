import { CronJob } from 'cron';
import { main as checkRss } from './rss-checking/main';

function main() {
  const dataDir = process.env.DATA_DIR || 'Empty DATA_DIR envar';

  schedule('*/10 * * * * *', () => checkRss(dataDir));
}

function schedule(cronPattern: string, job: () => void): void {
  new CronJob(cronPattern, job).start();
}

main();
