import { CronJob } from 'cron';

function main() {
  new CronJob('* * * * * *', () => {
    console.log('Tick');
  }).start();
}

main();
