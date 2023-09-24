import { CronCommand, CronJob } from 'cron';

export function startCronJob(cronTime: string, workerFn: CronCommand): CronJob {
  const startNow = true;
  const onComplete = null;

  return new CronJob(cronTime, workerFn, onComplete, startNow);
}
