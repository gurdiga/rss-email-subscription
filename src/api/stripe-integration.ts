import Stripe from 'stripe';
import { AccountId } from '../domain/account';
import { getAccountRootStorageKey } from '../domain/account-storage';
import { EmailAddress } from '../domain/email-address';
import { PlanId, isPaidPlan } from '../domain/plan';
import { AppStorage, StorageKey } from '../domain/storage';
import { StripeKeysResponseData, stripePaymentMethodTypes } from '../domain/stripe-integration';
import { makeSuccess } from '../shared/api-response';
import { Result, asyncAttempt, isErr, makeErr } from '../shared/lang';
import { makePath } from '../shared/path-utils';
import { si } from '../shared/string-utils';
import { AppRequestHandler } from './app-request-handler';

export const stripeKeys: AppRequestHandler = async function stripeConfig(
  _reqId,
  _reqBody,
  _reqParams,
  _reqSession,
  { env }
) {
  const logData = {};
  const responseData: StripeKeysResponseData = {
    publishableKey: env.STRIPE_PUBLISHABLE_KEY,
  };

  return makeSuccess('Stripe keys', logData, responseData);
};

export async function createStripeRecords(
  storage: AppStorage,
  secretKey: string,
  priceId: string,
  accountId: AccountId,
  email: EmailAddress,
  planId: PlanId
): Promise<Result<string | 'NOT_A_PAID_PLAN'>> {
  if (!isPaidPlan(planId)) {
    return 'NOT_A_PAID_PLAN';
  }

  const stripe = makeStripe(secretKey);
  const customer = await asyncAttempt(() => stripe.customers.create({ email: email.value }));

  if (isErr(customer)) {
    return makeErr(si`Failed to stripe.customers.create: ${customer.reason}`);
  }

  const storeCustomerResult = storeStripeCustomer(storage, accountId, customer);

  if (isErr(storeCustomerResult)) {
    return makeErr(si`Failed to ${storeStripeCustomer.name}: ${storeCustomerResult.reason}`);
  }

  const setupIntent = await asyncAttempt(() =>
    stripe.setupIntents.create({
      customer: customer.id,
      payment_method_types: stripePaymentMethodTypes,
    })
  );

  if (isErr(setupIntent)) {
    return makeErr(si`Failed to stripe.setupIntents.create: ${setupIntent.reason}`);
  }

  const clientSecret = setupIntent.client_secret;

  if (!clientSecret) {
    return makeErr(si`stripe.setupIntents.create returned empty "client_secret"`);
  }

  const subscription = await asyncAttempt(() =>
    stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: priceId }],
    })
  );

  if (isErr(subscription)) {
    return makeErr(si`Failed to stripe.subscriptions.create: ${subscription.reason}`);
  }

  const subscriptionItem = subscription.items.data[0];

  if (!subscriptionItem) {
    return makeErr(si`Subscription has no items`);
  }

  if (!subscriptionItem.id) {
    return makeErr(si`Subscription’s item has no ID`);
  }

  const storeScubscriptionItemResult = storeSubscriptionItemId(storage, accountId, subscriptionItem.id);

  if (isErr(storeScubscriptionItemResult)) {
    return makeErr(si`Failed to ${storeSubscriptionItemId.name}: ${storeScubscriptionItemResult.reason}`);
  }

  return clientSecret;
}

function storeStripeCustomer(storage: AppStorage, accountId: AccountId, customer: Stripe.Customer): Result<void> {
  const storageKey = getStripeCustomerStorageKey(accountId);

  return storage.storeItem(storageKey, customer);
}

function storeSubscriptionItemId(storage: AppStorage, accountId: AccountId, subscriptionItemId: string): Result<void> {
  const storageKey = getStripeSubscriptionItemStorageKey(accountId);

  return storage.storeItem(storageKey, subscriptionItemId);
}

function getStripeCustomerStorageKey(accountId: AccountId): StorageKey {
  return makePath(getAccountRootStorageKey(accountId), 'stripe-customer.json');
}

function getStripeSubscriptionItemStorageKey(accountId: AccountId): StorageKey {
  return makePath(getAccountRootStorageKey(accountId), 'stripe-subscription-item-id.json');
}

function makeStripe(secretKey: string): Stripe {
  const config: Stripe.StripeConfig = {
    apiVersion: '2022-11-15',
    maxNetworkRetries: 5,
  };

  return new Stripe(secretKey, config);
}
