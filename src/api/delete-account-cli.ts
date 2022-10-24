// NOTE: This is a helper tool to be used from the API tests.

import { rmSync } from 'node:fs';
import { basename } from 'node:path';
import { EmailAddress, makeEmailAddress } from '../app/email-sending/emails';
import { removeEmailFromIndex, findAccountIdByEmail, isAccountNotFound } from '../domain/account-index';
import { requireEnv } from '../shared/env';
import { attempt, isErr, makeErr, Result } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { getFirstCliArg, isRunDirectly } from '../shared/process-utils';
import { makeStorage } from '../shared/storage';

interface Env {
  DATA_DIR_ROOT: string;
}

function main(): void {
  const { logError } = makeCustomLoggers({ module: basename(__filename) });
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

  const deleteAccountResult = deleteAccount(email);

  if (isErr(deleteAccountResult)) {
    logError(`Couldn’t deleteAccount: ${deleteAccountResult.reason}`);
    process.exit(1);
  }
}

export function deleteAccount(email: EmailAddress): Result<void> {
  const env = requireEnv<Env>(['DATA_DIR_ROOT']);

  if (isErr(env)) {
    return makeErr(`Invalid environment variables: ${env.reason}`);
  }

  const storage = makeStorage(env.DATA_DIR_ROOT);
  const findResult = findAccountIdByEmail(storage, email);

  if (isErr(findResult)) {
    return makeErr(`Couldn’t findAccountIdByEmail: ${findResult.reason}`);
  }

  if (isAccountNotFound(findResult)) {
    return makeErr(`Accound not found my email ${email.value}`);
  }

  removeEmailFromIndex(storage, email);

  const rmDataResult = attempt(() => {
    rmSync(`${env.DATA_DIR_ROOT}/accounts/${findResult}/account.json`);
    rmSync(`${env.DATA_DIR_ROOT}/accounts/${findResult}`, { recursive: true });
  });

  if (isErr(rmDataResult)) {
    return makeErr(`Failed to delete account data: ${rmDataResult.reason}`);
  }
}

if (isRunDirectly(module)) {
  main();
}
