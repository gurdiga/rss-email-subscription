import { expect } from 'chai';
import { TransactionNotification } from '@paddle/paddle-node-sdk';
import { getAccountIdByEmail } from '../domain/account-crypto';
import { loadAccount, storeAccount } from '../domain/account-storage';
import { PlanId } from '../domain/plan';
import { isErr } from '../shared/lang';
import { makeTestAccount, makeTestEmailAddress, purgeTestStorageFromSnapshot } from '../shared/test-utils';
import { si } from '../shared/string-utils';
import { handleTransactionCompleted, handleSubscriptionCanceled } from './payment-integration';
import { hashingSalt, makeTestApp } from './test-utils';

describe(handleTransactionCompleted.name, () => {
  afterEach(purgeTestStorageFromSnapshot);

  it('returns undefined when transaction has no customerId', async () => {
    const paddle = makeFakePaddle('test@test.com');
    const result = await handleTransactionCompleted(makeTestApp(), paddle, makeFakeTransaction({ customerId: null }));
    expect(result).to.be.undefined;
  });

  it('returns an Err when Paddle customer lookup fails', async () => {
    const paddle = makeFakePaddle(new Error('network error'));
    const result = await handleTransactionCompleted(makeTestApp(), paddle, makeFakeTransaction());
    expect(isErr(result)).to.be.true;
  });

  it('returns undefined when customer email is invalid', async () => {
    const paddle = makeFakePaddle('not-an-email');
    const result = await handleTransactionCompleted(makeTestApp(), paddle, makeFakeTransaction());
    expect(result).to.be.undefined;
  });

  it('returns undefined when the purchased price is not a subscription plan', async () => {
    const paddle = makeFakePaddle('test@test.com');
    const result = await handleTransactionCompleted(makeTestApp(), paddle, makeFakeTransaction({ planIds: ['free'] }));
    expect(result).to.be.undefined;
  });

  it('returns undefined when items reference more than one plan', async () => {
    const paddle = makeFakePaddle('test@test.com');
    const result = await handleTransactionCompleted(
      makeTestApp(),
      paddle,
      makeFakeTransaction({ planIds: ['courage', 'mastery'] })
    );
    expect(result).to.be.undefined;
  });

  it('returns undefined when account not found', async () => {
    const paddle = makeFakePaddle('notfound@test.com');
    const result = await handleTransactionCompleted(
      makeTestApp(),
      paddle,
      makeFakeTransaction({ planIds: ['courage'] })
    );
    expect(result).to.be.undefined;
  });

  it('returns an Err when storeAccount fails', async () => {
    const email = makeTestEmailAddress('test@test.com');
    const app = makeTestApp();
    const accountId = getAccountIdByEmail(email, hashingSalt);
    storeAccount(app.storage, accountId, { ...makeTestAccount({ email: email.value }), planId: PlanId.PendingPayment });
    (app.storage as any).storeItem = () => ({ kind: 'Err', reason: 'disk full' });

    const paddle = makeFakePaddle('test@test.com');
    const result = await handleTransactionCompleted(app, paddle, makeFakeTransaction({ planIds: ['courage'] }));
    expect(isErr(result)).to.be.true;
  });

  it('upgrades account from PendingPayment to requested plan', async () => {
    const email = makeTestEmailAddress('test@test.com');
    const app = makeTestApp();
    const accountId = getAccountIdByEmail(email, hashingSalt);
    storeAccount(app.storage, accountId, { ...makeTestAccount({ email: email.value }), planId: PlanId.PendingPayment });

    const paddle = makeFakePaddle('test@test.com');
    const result = await handleTransactionCompleted(app, paddle, makeFakeTransaction({ planIds: ['courage'] }));
    expect(result).to.be.undefined;

    const account = loadAccount(app.storage, accountId);
    expect(isErr(account)).to.be.false;
    expect((account as any).planId).to.equal(PlanId.Courage);
  });

  it('grants the plan actually paid for, ignoring the transaction customData', async () => {
    const email = makeTestEmailAddress('test@test.com');
    const app = makeTestApp();
    const accountId = getAccountIdByEmail(email, hashingSalt);
    storeAccount(app.storage, accountId, { ...makeTestAccount({ email: email.value }), planId: PlanId.PendingPayment });

    const paddle = makeFakePaddle('test@test.com');
    const transaction = {
      ...makeFakeTransaction({ planIds: ['courage'] }),
      customData: { res_customer_email: 'victim@test.com', res_plan_id: 'mastery' },
    } as any;

    await handleTransactionCompleted(app, paddle, transaction);

    const account = loadAccount(app.storage, accountId);
    expect((account as any).planId).to.equal(PlanId.Courage);
  });

  it('stores card description when payment method is card', async () => {
    const email = makeTestEmailAddress('test@test.com');
    const app = makeTestApp();
    const accountId = getAccountIdByEmail(email, hashingSalt);
    storeAccount(app.storage, accountId, { ...makeTestAccount({ email: email.value }), planId: PlanId.PendingPayment });

    const paddle = makeFakePaddle('test@test.com');
    await handleTransactionCompleted(app, paddle, makeFakeTransaction({ planIds: ['courage'], card: true }));

    const cardKey = si`accounts/${accountId.value}/card-description.json`;
    const card = app.storage.loadItem(cardKey);
    expect(card).to.include('Visa');
    expect(card).to.include('4242');
  });
});

describe(handleSubscriptionCanceled.name, () => {
  afterEach(purgeTestStorageFromSnapshot);

  it('returns an Err when Paddle customer lookup fails', async () => {
    const paddle = makeFakePaddle(new Error('network error'));
    const result = await handleSubscriptionCanceled(makeTestApp(), paddle, 'ctm_123');
    expect(isErr(result)).to.be.true;
  });

  it('returns undefined when customer email is invalid', async () => {
    const paddle = makeFakePaddle('not-an-email');
    const result = await handleSubscriptionCanceled(makeTestApp(), paddle, 'ctm_123');
    expect(result).to.be.undefined;
  });

  it('returns undefined when account not found', async () => {
    const paddle = makeFakePaddle('notfound@test.com');
    const result = await handleSubscriptionCanceled(makeTestApp(), paddle, 'ctm_123');
    expect(result).to.be.undefined;
  });

  it('returns undefined when account is already on Free plan', async () => {
    const email = makeTestEmailAddress('test@test.com');
    const app = makeTestApp();
    const accountId = getAccountIdByEmail(email, hashingSalt);
    storeAccount(app.storage, accountId, { ...makeTestAccount({ email: email.value }), planId: PlanId.Free });

    const paddle = makeFakePaddle('test@test.com');
    const result = await handleSubscriptionCanceled(app, paddle, 'ctm_123');
    expect(result).to.be.undefined;
  });

  it('returns an Err when storeAccount fails', async () => {
    const email = makeTestEmailAddress('test@test.com');
    const app = makeTestApp();
    const accountId = getAccountIdByEmail(email, hashingSalt);
    storeAccount(app.storage, accountId, { ...makeTestAccount({ email: email.value }), planId: PlanId.Courage });
    (app.storage as any).storeItem = () => ({ kind: 'Err', reason: 'disk full' });

    const paddle = makeFakePaddle('test@test.com');
    const result = await handleSubscriptionCanceled(app, paddle, 'ctm_123');
    expect(isErr(result)).to.be.true;
  });

  it('downgrades account to Free on subscription cancellation', async () => {
    const email = makeTestEmailAddress('test@test.com');
    const app = makeTestApp();
    const accountId = getAccountIdByEmail(email, hashingSalt);
    storeAccount(app.storage, accountId, { ...makeTestAccount({ email: email.value }), planId: PlanId.Courage });

    const paddle = makeFakePaddle('test@test.com');
    const result = await handleSubscriptionCanceled(app, paddle, 'ctm_123');
    expect(result).to.be.undefined;

    const account = loadAccount(app.storage, accountId);
    expect((account as any).planId).to.equal(PlanId.Free);
  });
});

function makeFakeTransaction(
  options: { customerId?: string | null; planIds?: string[]; card?: boolean } = {}
): TransactionNotification {
  const { customerId = 'ctm_123', planIds = [], card = false } = options;

  return {
    customerId,
    items: planIds.map((planId) => ({ price: { customData: { res_plan_id: planId } } })),
    payments: card
      ? [{ methodDetails: { type: 'card', card: { type: 'visa', last4: '4242', expiryMonth: 12, expiryYear: 2030 } } }]
      : [],
  } as any;
}

function makeFakePaddle(customerEmail: string | Error): any {
  return {
    customers: {
      get: async () => {
        if (customerEmail instanceof Error) throw customerEmail;
        return { email: customerEmail };
      },
    },
  };
}
