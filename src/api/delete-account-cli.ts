// NOTE: This is a helper tool to be used from the API tests.

import { rmSync } from 'node:fs';
import { basename } from 'node:path';
import { makeEmailAddress } from '../domain/email-address-making';
import { EmailAddress } from '../domain/email-address';
import { getAccountIdByEmail } from '../domain/account-crypto';
import { accountsStorageKey } from '../domain/account-storage';
import { attempt, isErr, makeErr, Result } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { makePath } from '../shared/path-utils';
import { getFirstCliArg, isRunDirectly } from '../shared/process-utils';
import { si } from '../shared/string-utils';
import { initApp } from './init-app';

function main(): void {
  const { logError } = makeCustomLoggers({ module: basename(__filename) });
  const firstCliArg = getFirstCliArg(process);

  if (!firstCliArg) {
    logError('First argument is required: account email');
    process.exit(1);
  }

  const email = makeEmailAddress(firstCliArg);

  if (isErr(email)) {
    logError(si`Invalid account email: ${email.reason}`);
    process.exit(1);
  }

  const deleteAccountResult = deleteAccount(email);

  if (isErr(deleteAccountResult)) {
    logError(si`Failed to ${deleteAccount.name}: ${deleteAccountResult.reason}`);
    process.exit(1);
  }
}

export function deleteAccount(email: EmailAddress): Result<void> {
  const { env, settings } = initApp();
  const accountId = getAccountIdByEmail(email, settings.hashingSalt);
  const accountDirPath = makePath(env.DATA_DIR_ROOT, accountsStorageKey, accountId.value);

  const rmDataResult = attempt(() => {
    rmSync(accountDirPath, { recursive: true });
  });

  if (isErr(rmDataResult)) {
    return makeErr(si`Failed to delete account data: ${rmDataResult.reason}`);
  }
}

if (isRunDirectly(module)) {
  main();
}
