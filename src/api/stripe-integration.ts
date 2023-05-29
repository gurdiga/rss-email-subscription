import Stripe from 'stripe';
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

  const storeCustomerResult = storeStripeCustomer(storage, customer);

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

  const subscription = await asyncAttempt(() =>
    stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: priceId }],
    })
  );

  if (isErr(subscription)) {
    return makeErr(si`Failed to stripe.subscriptions.create: ${subscription.reason}`);
  }

  const clientSecret = setupIntent.client_secret;

  if (!clientSecret) {
    return makeErr(si`Failed to stripe.setupIntents.create returned empty "client_secret"`);
  }

  return clientSecret;
}

function storeStripeCustomer(storage: AppStorage, customer: Stripe.Customer) {
  const storageKey = getStripeCustomerStorageKey(customer.id);

  storage.storeItem(storageKey, customer);
}

/**
 * @param stripeCustomerId a string like this: "cus_NsjqlMycxxfyMg"
 */
function getStripeCustomerStorageKey(stripeCustomerId: string): StorageKey {
  return makePath('/stripe-customers', stripeCustomerId);
}

function makeStripe(secretKey: string): Stripe {
  const config: Stripe.StripeConfig = {
    apiVersion: '2022-11-15',
    maxNetworkRetries: 5,
  };

  return new Stripe(secretKey, config);
}
