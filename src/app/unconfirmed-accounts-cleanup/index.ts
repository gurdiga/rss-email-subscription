import { Paddle } from '@paddle/paddle-node-sdk';
import { cancelCustomerSubscription, isNothingToCancel } from '../../api/payment-integration';
import { Account, AccountId, isAccountNotFound } from '../../domain/account';
import { deleteAccount, getAccountIdList, loadAccount } from '../../domain/account-storage';
import { confirmationSecretLifetimeMs } from '../../domain/confirmation-secrets';
import { loadFeedsByAccountId } from '../../domain/feed-storage';
import { PlanId } from '../../domain/plan';
import { AppStorage } from '../../domain/storage';
import { isNotEmpty } from '../../shared/array-utils';
import { isErr } from '../../shared/lang';
import { logDuration, makeCustomLoggers } from '../../shared/logging';
import { si } from '../../shared/string-utils';

// An account whose registration is never confirmed is unreachable: the user can't log in
// (checkCredentials refuses it), can't delete it (that needs a session), and can't
// re-register, because accountExists doesn't care about confirmation state. Once the
// registration secret expires, nothing else in the system will ever touch the account.
//
// This sweeps by account age rather than by expiring secret. The secrets are already gone
// for every account currently stuck — they were expired without deleting anything — so a
// secret-driven sweep would have nothing to iterate.
export const unconfirmedAccountLifetimeMs = confirmationSecretLifetimeMs;

// Awaits and returns, unlike expireConfirmationSecrets, which leaves logDuration dangling
// and forces its spec to drain the microtask queue instead. This one awaits Paddle, so a
// caller that can't await it would observe the sweep before it has deleted anything.
export async function deleteStaleUnconfirmedAccounts(
  storage: AppStorage,
  paddle: Paddle,
  cancelFn = cancelCustomerSubscription
): Promise<void> {
  const logData = { module: deleteStaleUnconfirmedAccounts.name };

  await logDuration('Unconfirmed accounts cleanup', logData, async () => {
    const { logError, logWarning, logInfo } = makeCustomLoggers(logData);
    const accountIdList = getAccountIdList(storage);

    if (isErr(accountIdList)) {
      logError(si`Failed to ${getAccountIdList.name}: ${accountIdList.reason}`);
      return;
    }

    if (isNotEmpty(accountIdList.errs)) {
      logWarning(si`Found ${accountIdList.errs.length} invalid account IDs`);
    }

    let deletedAccountsCount = 0;

    for (const accountId of accountIdList.accountIds) {
      const deleted = await deleteAccountIfStaleUnconfirmed(storage, paddle, cancelFn, accountId);

      if (deleted) {
        deletedAccountsCount++;
      }
    }

    if (deletedAccountsCount > 0) {
      logInfo(si`Deleted stale unconfirmed accounts: ${deletedAccountsCount}`);
    }
  });
}

async function deleteAccountIfStaleUnconfirmed(
  storage: AppStorage,
  paddle: Paddle,
  cancelFn: typeof cancelCustomerSubscription,
  accountId: AccountId
): Promise<boolean> {
  const logData = { module: deleteAccountIfStaleUnconfirmed.name, accountId: accountId.value };
  const { logError, logWarning, logInfo } = makeCustomLoggers(logData);
  const account = loadAccount(storage, accountId);

  if (isErr(account)) {
    logWarning(si`Failed to ${loadAccount.name}: ${account.reason}`);
    return false;
  }

  if (isAccountNotFound(account)) {
    logWarning('Account not found for cleanup');
    return false;
  }

  if (!isStaleUnconfirmed(account)) {
    return false;
  }

  const feeds = loadFeedsByAccountId(accountId, storage);

  if (isErr(feeds)) {
    logError(si`Failed to ${loadFeedsByAccountId.name}: ${feeds.reason}`);
    return false;
  }

  // A confirmed account should be the only kind that can own feeds, so anything found
  // here means the unconfirmed-account invariant is already broken somewhere upstream.
  // Unreadable feeds are equally disqualifying: never delete on ambiguity.
  if (isNotEmpty(feeds.validFeeds) || isNotEmpty(feeds.errs) || isNotEmpty(feeds.feedIdErrs)) {
    logError('Unconfirmed account has feeds; skipping deletion', {
      email: account.email.value,
      validFeeds: feeds.validFeeds.length,
      errs: feeds.errs.length,
      feedIdErrs: feeds.feedIdErrs.length,
    });
    return false;
  }

  const cancelResult = await cancelFn(paddle, account.email);

  if (isErr(cancelResult)) {
    logError(si`Failed to ${cancelCustomerSubscription.name}; skipping deletion`, {
      reason: cancelResult.reason,
      email: account.email.value,
    });
    return false;
  }

  // A cancellable subscription on an account that never confirmed means the payment
  // completed but the transaction.completed webhook never upgraded the plan. Cancelling
  // wouldn't make deletion safe either: cancellation is effectiveFrom next_billing_period,
  // so the customer would keep being billed to period end with no account to show for it.
  if (!isNothingToCancel(cancelResult)) {
    logError('Unconfirmed account has a live Paddle subscription; skipping deletion', {
      email: account.email.value,
    });
    return false;
  }

  // Paddle was awaited above, so the user may have confirmed in the meantime.
  const currentAccount = loadAccount(storage, accountId);

  if (isErr(currentAccount) || isAccountNotFound(currentAccount) || !isStaleUnconfirmed(currentAccount)) {
    logWarning('Account changed while cancelling Paddle; skipping deletion');
    return false;
  }

  const deleteResult = deleteAccount(storage, accountId);

  if (isErr(deleteResult)) {
    logError(si`Failed to ${deleteAccount.name}: ${deleteResult.reason}`);
    return false;
  }

  if (isAccountNotFound(deleteResult)) {
    logWarning('Account to delete not found');
    return false;
  }

  logInfo('Deleted stale unconfirmed account', {
    email: account.email.value,
    creationTimestamp: account.creationTimestamp.toISOString(),
  });

  return true;
}

// PendingPayment is what registration writes and what the payment webhook clears, so it
// pins the account to the post-176efb1 registration flow. Accounts predating
// confirmationTimestamp also lack the field while carrying a real plan ID, which puts
// them outside that flow entirely; the missing timestamp alone would sweep them up too.
function isStaleUnconfirmed(account: Account): boolean {
  return (
    account.confirmationTimestamp === undefined &&
    account.planId === PlanId.PendingPayment &&
    account.creationTimestamp.getTime() < Date.now() - unconfirmedAccountLifetimeMs
  );
}
