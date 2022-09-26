// NOTE: This is a helper tool to be used from the API tests.

import { rmSync } from 'node:fs';
import { basename } from 'node:path';
import { makeEmailAddress } from '../app/email-sending/emails';
import { deleteAccountFromIndex, findAccountIdByEmail } from '../domain/account-index';
import { requireEnv } from '../shared/env';
import { attempt, isErr } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { getFirstCliArg } from '../shared/process-utils';
import { makeStorage } from '../shared/storage';

interface Env {
  DATA_DIR_ROOT: string;
}

function main(): void {
  const { logError } = makeCustomLoggers({ module: basename(__filename) });
  const env = requireEnv<Env>(['DATA_DIR_ROOT']);

  if (isErr(env)) {
    logError(`Invalid environment variables: ${env.reason}`);
    process.exit(1);
  }

  const firstCliArg = getFirstCliArg(process);

  if (!firstCliArg) {
    logError(`First argument is required: account email`);
    process.exit(1);
  }

  const email = makeEmailAddress(firstCliArg);

  if (isErr(email)) {
    logError(`Invalid account email: ${email.reason}`);
    process.exit(1);
  }

  const storage = makeStorage(env.DATA_DIR_ROOT);
  const accountId = findAccountIdByEmail(storage, email);

  deleteAccountFromIndex(storage, email);

  const rmDataResult = attempt(() => {
    rmSync(`${env.DATA_DIR_ROOT}/accounts/${accountId}/account.json`);
    rmSync(`${env.DATA_DIR_ROOT}/accounts/${accountId}`, { recursive: true });
  });

  if (isErr(rmDataResult)) {
    logError(`Failed to delete account data: ${rmDataResult.reason}`);
    process.exit(1);
  }
}

main();
