// NOTE: This is a helper tool for local development: prod’s demo account was
// created by hand, so a fresh DATA_DIR_ROOT has none.

import { basename } from 'node:path';
import { Account } from '../domain/account';
import { getAccountIdByEmail } from '../domain/account-crypto';
import { accountExists, storeAccount } from '../domain/account-storage';
import { demoAccountEmail, demoAccountPassword } from '../domain/demo-account';
import { makeEmailAddress } from '../domain/email-address-making';
import { hashPassword } from '../domain/hashed-password';
import { PlanId } from '../domain/plan';
import { isErr, makeErr, Result } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { isRunDirectly } from '../shared/process-utils';
import { si } from '../shared/string-utils';
import { initApp } from './init-app';

async function main(): Promise<void> {
  const { logInfo, logError } = makeCustomLoggers({ module: basename(__filename) });
  const result = await createDemoAccount();

  if (isErr(result)) {
    logError(si`Failed to ${createDemoAccount.name}: ${result.reason}`);
    process.exit(1);
  }

  logInfo(result);
}

export async function createDemoAccount(): Promise<Result<string>> {
  const { storage, settings } = initApp();
  const email = makeEmailAddress(demoAccountEmail);

  if (isErr(email)) {
    return makeErr(si`Invalid demo account email: ${email.reason}`);
  }

  const accountId = getAccountIdByEmail(email, settings.hashingSalt);
  const exists = accountExists(storage, accountId);

  if (isErr(exists)) {
    return makeErr(si`Failed to check if the demo account exists: ${exists.reason}`);
  }

  if (exists) {
    return si`Demo account already exists: ${accountId.value}`;
  }

  // Matches prod’s demo account: the SDE plan, confirmed at creation.
  const now = new Date();
  const account: Account = {
    planId: PlanId.SDE,
    email,
    hashedPassword: await hashPassword(demoAccountPassword),
    creationTimestamp: now,
    confirmationTimestamp: now,
    isAdmin: false,
    passwordChangedAt: now,
  };

  const storeResult = storeAccount(storage, accountId, account);

  if (isErr(storeResult)) {
    return makeErr(si`Failed to store the demo account: ${storeResult.reason}`);
  }

  return si`Demo account created: ${accountId.value}`;
}

if (isRunDirectly(module)) {
  main();
}
