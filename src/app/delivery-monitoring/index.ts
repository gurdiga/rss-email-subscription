import { AppEnv } from '../../api/init-app';
import { makeStorage } from '../../domain/storage';
import { startCronJob } from '../../shared/cron-utils';
import { requireEnv } from '../../shared/env';
import { isErr } from '../../shared/lang';
import { logHeartbeat, makeCustomLoggers } from '../../shared/logging';
import { si } from '../../shared/string-utils';
import { DelmonStatus } from './delmon-status';
import { processData } from './line-processing';

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

  startCronJob('6 6 * * *', () => {
    logHeartbeat(logInfo, { lineCount: status.lineCount });
  });
}

main();
