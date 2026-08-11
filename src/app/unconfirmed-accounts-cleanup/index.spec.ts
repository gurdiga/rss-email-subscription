import { expect } from 'chai';
import { Account, AccountData, AccountId } from '../../domain/account';
import { accountExists, storeAccount } from '../../domain/account-storage';
import { EmailAddress } from '../../domain/email-address';
import { getFeedJsonStorageKey } from '../../domain/feed-storage';
import { FeedId, makeFeedId } from '../../domain/feed-id';
import { NothingToCancel } from '../../api/payment-integration';
import { PlanId } from '../../domain/plan';
import { AppStorage } from '../../domain/storage';
import { Result, makeErr } from '../../shared/lang';
import {
  makeTestAccount,
  makeTestAccountId,
  makeTestStorageFromSnapshot,
  purgeTestStorageFromSnapshot,
} from '../../shared/test-utils';
import { deleteStaleUnconfirmedAccounts, unconfirmedAccountLifetimeMs } from './index';

// The Paddle constructor only wires up resource objects, so a dummy key costs nothing and
// reaches no network; every test stubs the one call that would.
const env = { PADDLE_API_KEY: 'test-api-key', PADDLE_ENVIRONMENT: 'sandbox' } as const;

describe(deleteStaleUnconfirmedAccounts.name, () => {
  afterEach(purgeTestStorageFromSnapshot);

  it('deletes an unconfirmed account whose confirmation link has expired', async () => {
    const storage = makeTestStorageFromSnapshot({});
    const accountId = storeTestAccount(storage, staleUnconfirmed());

    await deleteStaleUnconfirmedAccounts(storage, env, nothingToCancel);

    expect(accountExists(storage, accountId)).to.be.false;
  });

  // The whole point of the age check. Confirming and then never paying leaves the account
  // on PendingPayment, so the plan alone does not distinguish these.
  it('never deletes a confirmed account', async () => {
    const storage = makeTestStorageFromSnapshot({});
    const accountId = storeTestAccount(storage, staleUnconfirmed({ confirmationTimestamp: daysAgo(2) }));

    await deleteStaleUnconfirmedAccounts(storage, env, nothingToCancel);

    expect(accountExists(storage, accountId)).to.be.true;
  });

  // Accounts predating confirmationTimestamp have no such field while carrying a real
  // plan ID rather than PendingPayment — prod has four. The plan check is what keeps the
  // age check from sweeping them up.
  it('never deletes an old unconfirmed account on a plan other than PendingPayment', async () => {
    const storage = makeTestStorageFromSnapshot({});
    const legacy = staleUnconfirmed({ planId: PlanId.Courage, creationTimestamp: daysAgo(900) });
    const accountId = storeTestAccount(storage, legacy);

    await deleteStaleUnconfirmedAccounts(storage, env, nothingToCancel);

    expect(accountExists(storage, accountId)).to.be.true;
  });

  it('leaves an unconfirmed account whose confirmation link is still valid', async () => {
    const storage = makeTestStorageFromSnapshot({});
    const accountId = storeTestAccount(storage, staleUnconfirmed({ creationTimestamp: hoursAgo(1) }));

    await deleteStaleUnconfirmedAccounts(storage, env, nothingToCancel);

    expect(accountExists(storage, accountId)).to.be.true;
  });

  it('leaves an unconfirmed account that has feeds', async () => {
    const storage = makeTestStorageFromSnapshot({});
    const accountId = storeTestAccount(storage, staleUnconfirmed());

    const feedId = makeFeedId('test-feed') as FeedId;

    storage.storeItem(getFeedJsonStorageKey(accountId, feedId), { displayName: 'Test' });

    await deleteStaleUnconfirmedAccounts(storage, env, nothingToCancel);

    expect(accountExists(storage, accountId)).to.be.true;
  });

  it('leaves the account alone when Paddle cancellation fails', async () => {
    const storage = makeTestStorageFromSnapshot({});
    const accountId = storeTestAccount(storage, staleUnconfirmed());
    const cancelFails = async () => makeErr('Paddle is down');

    await deleteStaleUnconfirmedAccounts(storage, env, cancelFails);

    expect(accountExists(storage, accountId)).to.be.true;
  });

  // A cancellable subscription means the payment went through and the webhook never
  // upgraded the plan. Cancelling is effectiveFrom next_billing_period, so deleting after
  // a successful cancel would still bill a real person to period end for nothing.
  it('leaves the account alone when Paddle had a live subscription to cancel', async () => {
    const storage = makeTestStorageFromSnapshot({});
    const accountId = storeTestAccount(storage, staleUnconfirmed());
    const cancelSucceeds = async () => undefined;

    await deleteStaleUnconfirmedAccounts(storage, env, cancelSucceeds);

    expect(accountExists(storage, accountId)).to.be.true;
  });

  it('asks Paddle about the account email before deleting', async () => {
    const storage = makeTestStorageFromSnapshot({});
    const account = staleUnconfirmed({ email: 'stuck@test.com' });
    const askedAbout: string[] = [];

    storeTestAccount(storage, account);

    await deleteStaleUnconfirmedAccounts(storage, env, async (_paddle, email: EmailAddress) => {
      askedAbout.push(email.value);
      return { kind: 'NothingToCancel' as const };
    });

    expect(askedAbout).to.deep.equal(['stuck@test.com']);
  });
});

async function nothingToCancel(): Promise<Result<NothingToCancel>> {
  return { kind: 'NothingToCancel' };
}

function staleUnconfirmed(overrides: Partial<AccountData> = {}): Account {
  return makeTestAccount({
    planId: PlanId.PendingPayment,
    confirmationTimestamp: undefined,
    creationTimestamp: daysAgo(3),
    ...overrides,
  });
}

function storeTestAccount(storage: AppStorage, account: Account): AccountId {
  const accountId = makeTestAccountId(account.email.value.replace(/\W/g, ''));

  storeAccount(storage, accountId, account);

  return accountId;
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 3600 * 1000);
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 3600 * 1000);
}

// Guards against the lifetime drifting apart from the confirmation-secret lifetime the
// registration email advertises.
describe('unconfirmedAccountLifetimeMs', () => {
  it('matches the advertised confirmation link lifetime', () => {
    expect(unconfirmedAccountLifetimeMs).to.equal(48 * 3600 * 1000);
  });
});
