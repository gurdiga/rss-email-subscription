// One-off, for the deploy that starts linking accounts to Paddle customers by ID:
// links each paid or pending account to the customer found by its email, and
// reports whatever needs sorting out by hand. Read-only unless given --apply, and
// safe to run again.
//
// Run it from the api container once the new image is up, so that no older api
// process is left to rewrite an account without the new field:
//
//   docker exec api node dist/api/paddle-customer-backfill-cli.js [--apply]

import { Paddle } from '@paddle/paddle-node-sdk';
import { basename } from 'node:path';
import { Account, AccountId, isAccountNotFound } from '../domain/account';
import {
  findAccountIdByPaddleCustomerId,
  getAllAccountIds,
  isPaddleCustomerNotLinked,
  linkPaddleCustomer,
  loadAccount,
} from '../domain/account-storage';
import { makePaddleCustomerId } from '../domain/payment';
import { isSubscriptionPlan, PlanId } from '../domain/plan';
import { AppStorage } from '../domain/storage';
import { asyncAttempt, isErr } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { isRunDirectly } from '../shared/process-utils';
import { si } from '../shared/string-utils';
import { initApp } from './init-app';
import { findPaddleCustomerByEmail, isCustomerNotFound, makePaddle } from './payment-integration';

async function main(): Promise<void> {
  const { logInfo, logError } = makeCustomLoggers({ module: basename(__filename) });
  const { storage, env } = initApp();
  const isApplying = process.argv.includes('--apply');
  const paddle = makePaddle(env.PADDLE_API_KEY, env.PADDLE_ENVIRONMENT);
  const accountIds = getAllAccountIds(storage);

  if (isErr(accountIds)) {
    logError(si`Failed to ${getAllAccountIds.name}: ${accountIds.reason}`);
    process.exit(1);
  }

  logInfo(isApplying ? 'Linking accounts' : 'Dry run: nothing is written; pass --apply to link');

  let problemCount = 0;

  for (const accountId of accountIds) {
    const outcome = await backfillAccount(storage, paddle, accountId, isApplying);

    if (outcome.isProblem) {
      problemCount++;
      logError(outcome.message, { accountId: accountId.value, ...outcome.data });
    } else if (outcome.message) {
      logInfo(outcome.message, { accountId: accountId.value, ...outcome.data });
    }
  }

  const unlinkedCount = await reportUnlinkedCustomers(storage, paddle);

  if (isErr(unlinkedCount)) {
    logError(unlinkedCount.reason);
    process.exit(1);
  }

  logInfo('Done', { problemCount, unlinkedCount, isApplying });
}

interface Outcome {
  isProblem: boolean;
  message: string;
  data?: Record<string, string>;
}

async function backfillAccount(
  storage: AppStorage,
  paddle: Paddle,
  accountId: AccountId,
  isApplying: boolean
): Promise<Outcome> {
  const account = loadAccount(storage, accountId);

  if (isErr(account)) {
    return { isProblem: true, message: si`Failed to ${loadAccount.name}: ${account.reason}` };
  }

  if (isAccountNotFound(account) || !isBilled(account)) {
    return { isProblem: false, message: '' };
  }

  const email = account.email.value;

  if (account.paddleCustomerId) {
    return { isProblem: false, message: 'Already linked', data: { email } };
  }

  const customer = await findPaddleCustomerByEmail(paddle, account.email);

  if (isErr(customer)) {
    return { isProblem: true, message: customer.reason, data: { email } };
  }

  // The expected cause is an email changed here but never at Paddle.
  if (isCustomerNotFound(customer)) {
    return { isProblem: true, message: 'No Paddle customer for this email', data: { email } };
  }

  const customerId = makePaddleCustomerId(customer.id);

  if (isErr(customerId)) {
    return { isProblem: true, message: customerId.reason, data: { email } };
  }

  const data = { email, paddleCustomerId: customerId.value };
  const linkedAccountId = findAccountIdByPaddleCustomerId(storage, customerId);

  if (isErr(linkedAccountId)) {
    return { isProblem: true, message: linkedAccountId.reason, data };
  }

  if (!isPaddleCustomerNotLinked(linkedAccountId)) {
    return { isProblem: true, message: si`Customer already linked to ${linkedAccountId.value}`, data };
  }

  if (!isApplying) {
    return { isProblem: false, message: 'Would link', data };
  }

  const linkResult = linkPaddleCustomer(storage, accountId, customerId);

  if (isErr(linkResult)) {
    return { isProblem: true, message: si`Failed to ${linkPaddleCustomer.name}: ${linkResult.reason}`, data };
  }

  return { isProblem: false, message: 'Linked', data };
}

function isBilled(account: Account): boolean {
  return isSubscriptionPlan(account.planId) || account.planId === PlanId.PendingPayment;
}

// Every customer no account links to, live subscription or not: one left at an
// address its account has since moved away from is what a later registration at
// that address would be refused over, and only a full list shows those.
async function reportUnlinkedCustomers(storage: AppStorage, paddle: Paddle) {
  const { logError, logWarning } = makeCustomLoggers({ module: reportUnlinkedCustomers.name });
  const customers = await asyncAttempt(() => collect(paddle.customers.list({ perPage: 200 })));

  if (isErr(customers)) {
    return customers;
  }

  const subscriptions = await asyncAttempt(() =>
    collect(paddle.subscriptions.list({ perPage: 200, status: ['active', 'trialing', 'past_due', 'paused'] }))
  );

  if (isErr(subscriptions)) {
    return subscriptions;
  }

  const customerIdsWithLiveSubscriptions = new Set(subscriptions.map((x) => x.customerId));
  let unlinkedCount = 0;

  for (const customer of customers) {
    const customerId = makePaddleCustomerId(customer.id);

    if (isErr(customerId)) {
      logError(customerId.reason);
      continue;
    }

    const linkedAccountId = findAccountIdByPaddleCustomerId(storage, customerId);

    if (isErr(linkedAccountId)) {
      logError(linkedAccountId.reason, { paddleCustomerId: customerId.value });
      continue;
    }

    if (isPaddleCustomerNotLinked(linkedAccountId)) {
      unlinkedCount++;

      const hasLiveSubscription = customerIdsWithLiveSubscriptions.has(customer.id);
      const log = hasLiveSubscription ? logError : logWarning;

      log('Paddle customer linked to no account', {
        paddleCustomerId: customerId.value,
        email: customer.email,
        status: customer.status,
        hasLiveSubscription: String(hasLiveSubscription),
      });
    }
  }

  return unlinkedCount;
}

async function collect<T>(collection: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];

  for await (const item of collection) {
    items.push(item);
  }

  return items;
}

if (isRunDirectly(module)) {
  main();
}
