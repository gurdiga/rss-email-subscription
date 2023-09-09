import { LoggerFunction, makeCustomLoggers } from '../../shared/logging';
import { requireEnv } from '../../shared/env';
import { AppEnv } from '../../api/init-app';
import { makeStorage } from '../../domain/storage';
import { isErr } from '../../shared/lang';
import { si } from '../../shared/string-utils';
import { processData } from './line-processing';
import { CronJob } from 'cron';
import { DelmonStatus } from './delmon-status';
import { humanSize } from '../../shared/number-utils';

async function main() {
  const { logInfo, logWarning, logError } = makeCustomLoggers({ module: 'delivery-monitoring' });
  const env = requireEnv<AppEnv>(['DATA_DIR_ROOT']);
  const status: DelmonStatus = { lineCount: 0 };

  if (isErr(env)) {
    logError(si`Failed to ${requireEnv.name}: ${env.reason}`);
    return;
  }

  const storage = makeStorage(env.DATA_DIR_ROOT);

  if (isErr(storage)) {
    logError(si`Failed to ${requireEnv.name}: ${storage.reason}`);
    return;
  }

  process.stdin.on('data', (data: Buffer) => processData(data, status, storage));
  process.stdin.on('end', () => logWarning('End of STDIN'));

  logInfo(si`Started watching Postfix logs in ${process.env['NODE_ENV'] || 'MISSING_NODE_ENV'} environment`);

  new CronJob('6 6 * * *', () => {
    logHeartbeat(logInfo, status);
  }).start();
}

main();

function logHeartbeat(logInfo: LoggerFunction, status: DelmonStatus) {
  logInfo('delmon heartbeat', {
    lineCount: status.lineCount,
    uptimeDays: (process.uptime() / 3600 / 24).toFixed(),
    memoryUsage: memoryUsageStats(),
  });
}

function memoryUsageStats() {
  const usage = process.memoryUsage();

  return {
    rss: humanSize(usage.rss),
    heap: humanSize(usage.heapUsed),
  };
}
