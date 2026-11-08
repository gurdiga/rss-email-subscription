import { expect } from 'chai';
import { TransactionNotification } from '@paddle/paddle-node-sdk';
import { Account, AccountId } from '../domain/account';
import { getAccountIdByEmail } from '../domain/account-crypto';
import {
  deleteAccount,
  findAccountIdByPaddleCustomerId,
  linkPaddleCustomer,
  loadAccount,
  storeAccount,
} from '../domain/account-storage';
import { makePaddleCustomerId, PaddleCustomerId } from '../domain/payment';
import { PlanId } from '../domain/plan';
import { isErr } from '../shared/lang';
import { makeTestAccount, makeTestEmailAddress, purgeTestStorageFromSnapshot } from '../shared/test-utils';
import { si } from '../shared/string-utils';
import {
  cancelCustomerSubscription,
  changeCustomerSubscription,
  createCustomerWithSubscription,
  handleSubscriptionCanceled,
  handleTransactionCompleted,
  isPaddleCustomerTaken,
  loadCardDescription,
  removeScheduledCancellation,
} from './payment-integration';
import { App } from './init-app';
import { hashingSalt, makeTestApp } from './test-utils';

describe(handleTransactionCompleted.name, () => {
  afterEach(purgeTestStorageFromSnapshot);

  it('returns undefined when transaction has no customerId', () => {
    const result = handleTransactionCompleted(makeTestApp(), makeFakeTransaction({ customerId: null }), now());
    expect(result).to.be.undefined;
  });

  it('returns an Err for a malformed customer ID, so nothing is read by it', () => {
    const result = handleTransactionCompleted(
      makeTestApp(),
      makeFakeTransaction({ customerId: '../accounts/x' }),
      now()
    );
    expect(isErr(result)).to.be.true;
  });

  it('returns an Err for a customer linked to no account, so Paddle retries', () => {
    const result = handleTransactionCompleted(makeTestApp(), makeFakeTransaction({ planIds: ['courage'] }), now());
    expect(isErr(result)).to.be.true;
  });

  it('does not follow an index entry whose account doesn’t link back', () => {
    const app = makeTestApp();
    const accountId = storeLinkedAccount(app, PlanId.Courage);
    const stranger = makeTestAccount({ email: 'test@test.com', planId: PlanId.PendingPayment });

    // The same ID, as when the address is registered again after the account is gone.
    storeAccount(app.storage, accountId, stranger);

    const result = handleTransactionCompleted(app, makeFakeTransaction({ planIds: ['mastery'] }), now());

    expect(isErr(result)).to.be.true;
    expect(loadTestAccount(app, accountId).planId).to.equal(PlanId.PendingPayment);
  });

  it('returns undefined when the purchased price is not a subscription plan', () => {
    const app = makeTestApp();
    storeLinkedAccount(app);
    const result = handleTransactionCompleted(app, makeFakeTransaction({ planIds: ['free'] }), now());
    expect(result).to.be.undefined;
  });

  it('returns undefined when items reference more than one plan', () => {
    const app = makeTestApp();
    storeLinkedAccount(app);
    const result = handleTransactionCompleted(app, makeFakeTransaction({ planIds: ['courage', 'mastery'] }), now());
    expect(result).to.be.undefined;
  });

  it('returns an Err when storeAccount fails', () => {
    const app = makeTestApp();
    storeLinkedAccount(app);
    (app.storage as any).storeItem = () => ({ kind: 'Err', reason: 'disk full' });

    const result = handleTransactionCompleted(app, makeFakeTransaction({ planIds: ['courage'] }), now());
    expect(isErr(result)).to.be.true;
  });

  it('upgrades account from PendingPayment to requested plan', () => {
    const app = makeTestApp();
    const accountId = storeLinkedAccount(app);

    const result = handleTransactionCompleted(app, makeFakeTransaction({ planIds: ['courage'] }), now());
    expect(result).to.be.undefined;

    expect(loadTestAccount(app, accountId).planId).to.equal(PlanId.Courage);
  });

  it('grants the plan actually paid for, ignoring the transaction customData', () => {
    const app = makeTestApp();
    const accountId = storeLinkedAccount(app);
    const transaction = {
      ...makeFakeTransaction({ planIds: ['courage'] }),
      customData: { res_customer_email: 'victim@test.com', res_plan_id: 'mastery' },
    } as any;

    handleTransactionCompleted(app, transaction, now());

    expect(loadTestAccount(app, accountId).planId).to.equal(PlanId.Courage);
  });

  it('ignores a transaction that occurred before the last applied event', () => {
    const app = makeTestApp();
    const accountId = storeLinkedAccount(app, PlanId.Courage);

    handleSubscriptionCanceled(app, customerId, minutesAgo(1));
    handleTransactionCompleted(app, makeFakeTransaction({ planIds: ['courage'] }), minutesAgo(2));

    expect(loadTestAccount(app, accountId).planId).to.equal(PlanId.Free);
  });

  it('lets a purchase through after a newer card-only transaction', () => {
    const app = makeTestApp();
    const accountId = storeLinkedAccount(app);

    handleTransactionCompleted(app, makeFakeTransaction({ card: true }), minutesAgo(1));
    handleTransactionCompleted(app, makeFakeTransaction({ planIds: ['courage'] }), minutesAgo(2));

    expect(loadTestAccount(app, accountId).planId).to.equal(PlanId.Courage);
  });

  it('applies a repeated delivery of the same event only once', () => {
    const app = makeTestApp();
    const accountId = storeLinkedAccount(app);
    const occurredAt = minutesAgo(1);

    handleTransactionCompleted(app, makeFakeTransaction({ planIds: ['courage'] }), occurredAt);
    storeAccount(app.storage, accountId, { ...loadTestAccount(app, accountId), planId: PlanId.Mastery });
    handleTransactionCompleted(app, makeFakeTransaction({ planIds: ['courage'] }), occurredAt);

    expect(loadTestAccount(app, accountId).planId).to.equal(PlanId.Mastery);
  });

  it('stores card description when payment method is card', () => {
    const app = makeTestApp();
    const accountId = storeLinkedAccount(app);

    handleTransactionCompleted(app, makeFakeTransaction({ planIds: ['courage'], card: true }), now());

    const cardKey = si`accounts/${accountId.value}/card-description.json`;
    const card = app.storage.loadItem(cardKey);
    expect(card).to.include('Visa');
    expect(card).to.include('4242');
  });

  it('skips storing a card description when Paddle omits a card field', () => {
    const app = makeTestApp();
    const accountId = storeLinkedAccount(app);

    handleTransactionCompleted(app, makeFakeTransaction({ planIds: ['courage'], card: { last4: undefined } }), now());

    expect(loadCardDescription(app.storage, accountId)).to.be.undefined;
  });

  it('leaves a prior card description in place when a later transaction has an invalid field', () => {
    const app = makeTestApp();
    const accountId = storeLinkedAccount(app);

    handleTransactionCompleted(app, makeFakeTransaction({ planIds: ['courage'], card: true }), minutesAgo(2));
    handleTransactionCompleted(
      app,
      makeFakeTransaction({ planIds: ['courage'], card: { last4: undefined } }),
      minutesAgo(1)
    );

    expect(loadCardDescription(app.storage, accountId)).to.include('4242');
  });
});

describe(handleSubscriptionCanceled.name, () => {
  afterEach(purgeTestStorageFromSnapshot);

  it('returns an Err for a customer linked to no account, so Paddle retries', () => {
    const result = handleSubscriptionCanceled(makeTestApp(), customerId, now());
    expect(isErr(result)).to.be.true;
  });

  it('accepts the cancellation of a deleted account’s subscription', () => {
    const app = makeTestApp();
    const accountId = storeLinkedAccount(app, PlanId.Courage);

    deleteAccount(app.storage, accountId);

    expect(handleSubscriptionCanceled(app, customerId, now())).to.be.undefined;
  });

  it('returns undefined when account is already on Free plan', () => {
    const app = makeTestApp();
    storeLinkedAccount(app, PlanId.Free);

    const result = handleSubscriptionCanceled(app, customerId, now());
    expect(result).to.be.undefined;
  });

  it('returns an Err when storeAccount fails', () => {
    const app = makeTestApp();
    storeLinkedAccount(app, PlanId.Courage);
    (app.storage as any).storeItem = () => ({ kind: 'Err', reason: 'disk full' });

    const result = handleSubscriptionCanceled(app, customerId, now());
    expect(isErr(result)).to.be.true;
  });

  it('clears the pending cancellation once it takes effect', () => {
    const app = makeTestApp();
    const accountId = storeLinkedAccount(app, PlanId.Courage);

    storeAccount(app.storage, accountId, { ...loadTestAccount(app, accountId), pendingCancellationAt: new Date() });
    handleSubscriptionCanceled(app, customerId, now());

    expect(loadTestAccount(app, accountId).pendingCancellationAt).to.be.undefined;
  });

  it('downgrades account to Free on subscription cancellation', () => {
    const app = makeTestApp();
    const accountId = storeLinkedAccount(app, PlanId.Courage);

    const result = handleSubscriptionCanceled(app, customerId, now());
    expect(result).to.be.undefined;

    expect(loadTestAccount(app, accountId).planId).to.equal(PlanId.Free);
  });

  it('leaves a pending account pending, and its later-delivered purchase ignored', () => {
    const app = makeTestApp();
    const accountId = storeLinkedAccount(app, PlanId.PendingPayment);

    handleSubscriptionCanceled(app, customerId, minutesAgo(1));
    expect(loadTestAccount(app, accountId).planId).to.equal(PlanId.PendingPayment);

    handleTransactionCompleted(app, makeFakeTransaction({ planIds: ['courage'] }), minutesAgo(2));
    expect(loadTestAccount(app, accountId).planId).to.equal(PlanId.PendingPayment);
  });
});

describe(createCustomerWithSubscription.name, () => {
  afterEach(purgeTestStorageFromSnapshot);

  it('links the customer before creating the transaction', async () => {
    const app = makeTestApp();
    const accountId = storeTestAccount(app);
    let linkedAtCheckout: unknown;
    const paddle = makeFakePaddle({
      onTransactionCreate: () => (linkedAtCheckout = findAccountIdByPaddleCustomerId(app.storage, makeCustomerId())),
    });

    const result = await createCustomerWithSubscription(paddle, app.storage, accountId, PlanId.Courage);

    expect(result).to.deep.include({ kind: 'PaddleTransactionId' });
    expect(linkedAtCheckout).to.deep.equal(accountId);
  });

  it('refuses a customer already linked to another account', async () => {
    const app = makeTestApp();
    storeLinkedAccount(app, PlanId.Courage);
    const accountId = storeTestAccount(app, 'newcomer@test.com');
    const paddle = makeFakePaddle({ onTransactionCreate: () => expect.fail('created a transaction') });

    const result = await createCustomerWithSubscription(paddle, app.storage, accountId, PlanId.Courage);

    expect(isPaddleCustomerTaken(result), JSON.stringify(result)).to.be.true;
    expect(loadTestAccount(app, accountId).paddleCustomerId).to.be.undefined;
  });

  it('refuses an unlinked customer that still has a live subscription', async () => {
    const app = makeTestApp();
    const accountId = storeTestAccount(app);
    const paddle = makeFakePaddle({ liveSubscriptionIds: ['sub_01left'] });

    const result = await createCustomerWithSubscription(paddle, app.storage, accountId, PlanId.Courage);

    expect(isPaddleCustomerTaken(result), JSON.stringify(result)).to.be.true;
    expect(loadTestAccount(app, accountId).paddleCustomerId).to.be.undefined;
  });

  it('uses the account’s own linked customer without looking up its email', async () => {
    const app = makeTestApp();
    const accountId = storeLinkedAccount(app, PlanId.Free);
    const paddle = makeFakePaddle({ onCustomersList: () => expect.fail('looked up by email') });

    const result = await createCustomerWithSubscription(paddle, app.storage, accountId, PlanId.Courage);

    expect(result).to.deep.include({ kind: 'PaddleTransactionId' });
  });

  function storeTestAccount(app: App, emailString = 'test@test.com'): AccountId {
    const email = makeTestEmailAddress(emailString);
    const accountId = getAccountIdByEmail(email, hashingSalt);

    storeAccount(app.storage, accountId, makeTestAccount({ email: email.value, planId: PlanId.PendingPayment }));

    return accountId;
  }

  // The Paddle calls createCustomerWithSubscription makes, answering as if a customer
  // with this test’s email already exists.
  function makeFakePaddle(
    options: { liveSubscriptionIds?: string[]; onTransactionCreate?: () => void; onCustomersList?: () => void } = {}
  ): any {
    const { liveSubscriptionIds = [], onTransactionCreate = () => {}, onCustomersList = () => {} } = options;
    const page = <T>(items: T[]) => ({ next: async () => items });

    return {
      customers: {
        list: () => {
          onCustomersList();
          return page([{ id: customerId }]);
        },
      },
      subscriptions: { list: () => page(liveSubscriptionIds.map((id) => ({ id }))) },
      prices: { list: () => page([{ id: 'pri_01courage', customData: { res_plan_id: 'courage' } }]) },
      transactions: {
        create: async () => {
          onTransactionCreate();
          return { id: 'txn_01test' };
        },
      },
    };
  }
});

describe(cancelCustomerSubscription.name, () => {
  it('leaves a subscription already set to cancel alone, and reports when it ends', async () => {
    const subscription = { id: 'sub_01test', scheduledChange: { action: 'cancel', effectiveAt: periodEnd } };
    const paddle = makeFakeSubscriptionsPaddle([subscription], {
      cancel: async () => expect.fail('cancelled again'),
    });

    const result = await cancelCustomerSubscription(paddle, makeCustomerId());

    expect(result).to.deep.equal({ kind: 'ScheduledCancellation', effectiveAt: new Date(periodEnd) });
  });

  it('reports when a new cancellation takes effect', async () => {
    const paddle = makeFakeSubscriptionsPaddle([{ id: 'sub_01test', scheduledChange: null }], {
      cancel: async () => ({ scheduledChange: { action: 'cancel', effectiveAt: periodEnd } }),
    });

    const result = await cancelCustomerSubscription(paddle, makeCustomerId());

    expect(result).to.deep.equal({ kind: 'ScheduledCancellation', effectiveAt: new Date(periodEnd) });
  });
});

describe(removeScheduledCancellation.name, () => {
  it('lifts a scheduled cancellation, and leaves other subscriptions alone', async () => {
    const updates: unknown[] = [];
    const paddle = makeFakeSubscriptionsPaddle(
      [
        { id: 'sub_01cancelling', scheduledChange: { action: 'cancel', effectiveAt: periodEnd } },
        { id: 'sub_01pausing', scheduledChange: { action: 'pause', effectiveAt: periodEnd } },
      ],
      { update: async (id: string, body: unknown) => updates.push([id, body]) }
    );

    const result = await removeScheduledCancellation(paddle, makeCustomerId());

    expect(result).to.be.undefined;
    expect(updates).to.deep.equal([['sub_01cancelling', { scheduledChange: null }]]);
  });

  it('reports nothing to keep once the subscription has ended', async () => {
    const paddle = makeFakeSubscriptionsPaddle([]);

    expect(await removeScheduledCancellation(paddle, makeCustomerId())).to.deep.equal({ kind: 'NothingToCancel' });
  });
});

describe(changeCustomerSubscription.name, () => {
  it('lifts a pending cancellation before changing the plan', async () => {
    const updates: unknown[] = [];
    const paddle = makeFakeSubscriptionsPaddle(
      [{ id: 'sub_01test', status: 'active', scheduledChange: { action: 'cancel', effectiveAt: periodEnd } }],
      { update: async (_id: string, body: object) => updates.push(Object.keys(body)) }
    );

    const result = await changeCustomerSubscription(paddle, makeCustomerId(), PlanId.Mastery);

    expect(result).to.be.undefined;
    expect(updates).to.deep.equal([['scheduledChange'], ['items', 'prorationBillingMode']]);
  });

  it('puts the lifted cancellation back when the plan change fails', async () => {
    const cancellations: unknown[] = [];
    const paddle = makeFakeSubscriptionsPaddle(
      [{ id: 'sub_01test', status: 'active', scheduledChange: { action: 'cancel', effectiveAt: periodEnd } }],
      {
        update: async (_id: string, body: object) => {
          if ('items' in body) {
            throw new Error('Paddle is down');
          }
        },
        cancel: async (id: string, body: unknown) => cancellations.push([id, body]),
      }
    );

    const result = await changeCustomerSubscription(paddle, makeCustomerId(), PlanId.Mastery);

    expect(isErr(result)).to.be.true;
    expect(cancellations).to.deep.equal([['sub_01test', { effectiveFrom: 'next_billing_period' }]]);
  });
});

const periodEnd = '2026-12-03T00:00:00.000Z';

function makeFakeSubscriptionsPaddle(subscriptions: object[], overrides: object = {}): any {
  return {
    subscriptions: { list: () => ({ next: async () => subscriptions }), ...overrides },
    prices: { list: () => ({ next: async () => [{ id: 'pri_01mastery', customData: { res_plan_id: 'mastery' } }] }) },
  };
}

const customerId = 'ctm_01aaaaaaaaaaaaaaaaaaaaaaaa';

function makeCustomerId(): PaddleCustomerId {
  return makePaddleCustomerId(customerId) as PaddleCustomerId;
}

function storeLinkedAccount(app: App, planId = PlanId.PendingPayment): AccountId {
  const email = makeTestEmailAddress('test@test.com');
  const accountId = getAccountIdByEmail(email, hashingSalt);

  storeAccount(app.storage, accountId, makeTestAccount({ email: email.value, planId }));
  linkPaddleCustomer(app.storage, accountId, makeCustomerId());

  return accountId;
}

function loadTestAccount(app: App, accountId: AccountId): Account {
  return loadAccount(app.storage, accountId) as Account;
}

function now(): Date {
  return new Date();
}

function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60_000);
}

function makeFakeTransaction(
  options: {
    customerId?: string | null;
    planIds?: string[];
    card?: boolean | Partial<{ type: string; last4: string; expiryMonth: number; expiryYear: number }>;
  } = {}
): TransactionNotification {
  const { customerId: transactionCustomerId = customerId, planIds = [], card = false } = options;
  const cardOverrides = card === true || card === false ? {} : card;

  return {
    customerId: transactionCustomerId,
    items: planIds.map((planId) => ({ price: { customData: { res_plan_id: planId } } })),
    payments: card
      ? [
          {
            methodDetails: {
              type: 'card',
              card: { type: 'visa', last4: '4242', expiryMonth: 12, expiryYear: 2030, ...cardOverrides },
            },
          },
        ]
      : [],
  } as any;
}
