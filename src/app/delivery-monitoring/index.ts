import { makeCustomLoggers } from '../../shared/logging';
import { requireEnv } from '../../shared/env';
import { AppEnv } from '../../api/init-app';
import { makeStorage } from '../../domain/storage';
import { isErr } from '../../shared/lang';
import { si } from '../../shared/string-utils';
import { processData } from './utils';

async function main() {
  const { logInfo, logWarning, logError } = makeCustomLoggers({ module: 'postfix-log-watching' });
  const env = requireEnv<AppEnv>(['DATA_DIR_ROOT', 'DOMAIN_NAME', 'SMTP_CONNECTION_STRING']);

  if (isErr(env)) {
    logError(si`Failed to ${requireEnv.name}: ${env.reason}`);
    return;
  }

  const storage = makeStorage(env.DATA_DIR_ROOT);

  if (isErr(storage)) {
    logError(si`Failed to ${requireEnv.name}: ${storage.reason}`);
    return;
  }

  process.stdin.on('data', processData);
  process.stdin.on('end', () => logWarning('End of STDIN'));

  logInfo(si`Stared watching Postfix logs in ${process.env['NODE_ENV']!} environment`);
}

main();
