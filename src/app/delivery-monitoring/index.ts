import { makeCustomLoggers } from '../../shared/logging';
import { requireEnv } from '../../shared/env';
import { AppEnv } from '../../api/init-app';
import { makeStorage } from '../../domain/storage';
import { isErr } from '../../shared/lang';
import { si } from '../../shared/string-utils';
import { processData } from './line-processing';

async function main() {
  const { logInfo, logWarning, logError } = makeCustomLoggers({ module: 'delivery-monitoring' });
  const env = requireEnv<AppEnv>(['DATA_DIR_ROOT']);

  if (isErr(env)) {
    logError(si`Failed to ${requireEnv.name}: ${env.reason}`);
    return;
  }

  const storage = makeStorage(env.DATA_DIR_ROOT);

  if (isErr(storage)) {
    logError(si`Failed to ${requireEnv.name}: ${storage.reason}`);
    return;
  }

  process.stdin.on('data', (data: Buffer) => processData(data, storage));
  process.stdin.on('end', () => logWarning('End of STDIN'));

  logInfo(si`Stared watching Postfix logs in ${process.env['NODE_ENV']!} environment`);
}

main();
