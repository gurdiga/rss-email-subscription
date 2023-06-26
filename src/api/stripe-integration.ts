import Stripe from 'stripe';
import { AccountId } from '../domain/account';
import { getAccountRootStorageKey } from '../domain/account-storage';
import { EmailAddress } from '../domain/email-address';
import { PlanId, isSubscriptionPlan } from '../domain/plan';
import { AppStorage, StorageKey } from '../domain/storage';
import {
  AccountSupportProductResponseData,
  StoreCardRequest,
  StripeKeysResponseData,
  makeCardDescription,
} from '../domain/stripe-integration';
import { makeAppError, makeInputError, makeNotAuthenticatedError, makeSuccess } from '../shared/api-response';
import {
  Result,
  asyncAttempt,
  isErr,
  isObject,
  makeErr,
  makeNonEmptyString,
  makeNumber,
  makeString,
  makeValues,
} from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { makePath } from '../shared/path-utils';
import { si } from '../shared/string-utils';
import { AppRequestHandler } from './app-request-handler';
import { checkSession, isAuthenticatedSession } from './session';

export const stripeKeys: AppRequestHandler = async function stripeKeys(
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

export const storeStripeCardDescription: AppRequestHandler = async function storeStripeCardDescription(
  reqId,
  reqBody,
  _reqParams,
  reqSession,
  { env, storage }
) {
  const { logWarning, logError } = makeCustomLoggers({ module: storeStripeCardDescription.name, reqId });
  const session = checkSession(reqSession);

  if (!isAuthenticatedSession(session)) {
    logWarning('Not authenticated', { reason: session.err.reason });
    return makeNotAuthenticatedError();
  }

  const request = makeStoreCardRequest(reqBody);

  if (isErr(request)) {
    logError(si`Failed to ${makeStoreCardRequest.name}: ${request.reason}`);
    return makeInputError('Invalid request');
  }

  const cardDescription = makeCardDescription(request);

  const { accountId } = session;
  const storeResult = storeCardDescription(storage, accountId, cardDescription);

  if (isErr(storeResult)) {
    logError(si`Failed to ${storeCardDescription.name}: ${storeResult.reason}`);
    return makeAppError();
  }

  const logData = {};
  const responseData: StripeKeysResponseData = {
    publishableKey: env.STRIPE_PUBLISHABLE_KEY,
  };

  return makeSuccess('Stripe keys', logData, responseData);
};

function storeCardDescription(storage: AppStorage, accountId: AccountId, cardDescription: string): Result<void> {
  const storageKey = getStripeCardDescriptionStorageKey(accountId);

  return storage.storeItem(storageKey, cardDescription);
}

export function loadCardDescription(storage: AppStorage, accountId: AccountId): Result<string | undefined> {
  const storageKey = getStripeCardDescriptionStorageKey(accountId);

  const exists = storage.hasItem(storageKey);

  if (isErr(exists)) {
    return makeErr(si`Failed to check if item exists: ${exists.reason}`);
  }

  if (exists === false) {
    return;
  }

  return storage.loadItem(storageKey);
}

function getStripeCardDescriptionStorageKey(accountId: AccountId): StorageKey {
  return makePath(getAccountRootStorageKey(accountId), 'card-description.json');
}

function makeStoreCardRequest(data: unknown): Result<StoreCardRequest> {
  return makeValues<StoreCardRequest>(data, {
    brand: makeNonEmptyString,
    exp_month: makeNumber,
    exp_year: makeNumber,
    last4: makeNonEmptyString,
  });
}

export const accountSupportProduct: AppRequestHandler = async function accountSupportProduct(
  reqId,
  _reqBody,
  _reqParams,
  _reqSession,
  { env }
) {
  const { logError } = makeCustomLoggers({ module: accountSupportProduct.name, reqId });

  const stripe = makeStripe(env.STRIPE_SECRET_KEY);
  const stripeApiProductList = await asyncAttempt(() => stripe.products.list({ expand: ['data.default_price'] }));

  if (isErr(stripeApiProductList)) {
    logError(si`Failed to stripe.products.list: ${stripeApiProductList.reason}`);
    return makeAppError();
  }

  const product = stripeApiProductList.data.find((x) => x.metadata['res_code'] === 'account_setup');

  if (!product) {
    makeErr('Account support product not found in product list from Stripe');
    return makeAppError();
  }

  const paymentLinks = await asyncAttempt(() => stripe.paymentLinks.list());

  if (isErr(paymentLinks)) {
    logError(si`Failed to stripe.paymentLinks.list: ${paymentLinks.reason}`);
    return makeAppError();
  }

  const priceInCents = (product.default_price as Stripe.Price)?.unit_amount;
  const paymentLinkUrl = paymentLinks.data?.find((x) => x.metadata?.['res_code'] === 'account_setup_payment_link')?.url;

  const accountSupportProductData: Record<keyof AccountSupportProductResponseData, unknown> = {
    name: product.name,
    description: product.description,
    priceInCents,
    paymentLinkUrl,
  };

  const responseData = makeAccountSupportProductResponseData(accountSupportProductData);

  if (isErr(responseData)) {
    logError(si`Some information is missing in the Stripe product: ${responseData.reason}`, { product });
    return makeAppError();
  }

  const logData = {};

  return makeSuccess('Account Support product', logData, responseData);
};

function makeAccountSupportProductResponseData(data: unknown): Result<AccountSupportProductResponseData> {
  return makeValues<AccountSupportProductResponseData>(data, {
    name: makeString,
    description: makeString,
    priceInCents: makeNumber,
    paymentLinkUrl: makeString,
  });
}

type ClientSecret = string;

export async function createStripeRecords(
  storage: AppStorage,
  secretKey: string,
  accountId: AccountId,
  email: EmailAddress,
  planId: PlanId
): Promise<Result<ClientSecret | 'NOT_A_PAID_PLAN'>> {
  if (!isSubscriptionPlan(planId)) {
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

  const query = si`metadata['res_plan_id']:'${planId}'`;
  const prices = await asyncAttempt(() => stripe.prices.search({ query }));

  if (isErr(prices)) {
    return makeErr(si`Failed to stripe.prices.search: ${prices.reason}`);
  }

  const price = prices.data[0];

  if (!price) {
    return makeErr(si`Price not found with stripe.prices.search: query=${query}`);
  }

  const subscription = await asyncAttempt(() =>
    stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: price.id }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
    })
  );

  if (isErr(subscription)) {
    return makeErr(si`Failed to stripe.subscriptions.create: ${subscription.reason}`);
  }

  const storeSubscriptionResult = storeSubscription(storage, accountId, subscription);

  if (isErr(storeSubscriptionResult)) {
    return makeErr(si`Failed to ${storeSubscription.name}: ${storeSubscriptionResult.reason}`);
  }

  const clientSecret = makeClientSecret(subscription);

  if (isErr(clientSecret)) {
    return makeErr(si`Failed to ${makeClientSecret.name}: ${clientSecret.reason}`);
  }

  return clientSecret;
}

export async function cancelStripeSubscription(
  storage: AppStorage,
  secretKey: string,
  accountId: AccountId
): Promise<Result<void>> {
  const stripe = makeStripe(secretKey);
  const subscriptionId = getStoredStripeSubscriptionId(storage, accountId);

  if (isErr(subscriptionId)) {
    return makeErr(si`Failed to ${getStoredStripeSubscriptionId.name}: ${subscriptionId.reason}`);
  }

  const subscription = await asyncAttempt(() =>
    stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    })
  );

  if (isErr(subscription)) {
    return makeErr(si`Failed to stripe.subscriptions.update: ${subscription.reason}`);
  }

  if (subscription.status !== 'canceled') {
    return makeErr(si`Subscription has not been canceled by stripe.subscriptions.update: it is ${subscription.status}`);
  }
}

interface StoredStripeSubscription {
  id: string;
  // there are others, but those are not relevant at the moment
}

function getStoredStripeSubscriptionId(storage: AppStorage, accountId: AccountId): Result<string> {
  const storageKey = getStripeSubscriptionStorageKey(accountId);

  const data = storage.loadItem(storageKey);
  const storedSubscription = makeValues<StoredStripeSubscription>(data, {
    id: makeNonEmptyString,
  });

  if (isErr(storedSubscription)) {
    return makeErr(si`Failed to read stored subscription data: ${storedSubscription.reason}`);
  }

  return storedSubscription.id;
}

function makeClientSecret(subscription: Stripe.Subscription): Result<ClientSecret> {
  const latestInvoice = subscription.latest_invoice;

  if (!isObject(latestInvoice)) {
    return makeErr(si`Non-object subscription.latest_invoice: ${JSON.stringify(latestInvoice)}`);
  }

  const paymentIntent = latestInvoice.payment_intent;

  if (!isObject(paymentIntent)) {
    return makeErr(si`Non-object subscription.latest_invoice.payment_intent: ${JSON.stringify(paymentIntent)}`);
  }

  const clientSecret = paymentIntent.client_secret;

  if (clientSecret === null) {
    return makeErr(si`Null subscription.latest_invoice.payment_intent.client_secret`);
  }

  return clientSecret;
}

function storeStripeCustomer(storage: AppStorage, accountId: AccountId, customer: Stripe.Customer): Result<void> {
  const storageKey = getStripeCustomerStorageKey(accountId);

  return storage.storeItem(storageKey, customer);
}

function storeSubscription(storage: AppStorage, accountId: AccountId, subscription: Stripe.Subscription): Result<void> {
  const storageKey = getStripeSubscriptionStorageKey(accountId);

  return storage.storeItem(storageKey, subscription);
}

function getStripeCustomerStorageKey(accountId: AccountId): StorageKey {
  return makePath(getAccountRootStorageKey(accountId), 'stripe-customer.json');
}

export function getStripeSubscriptionStorageKey(accountId: AccountId): StorageKey {
  return makePath(getAccountRootStorageKey(accountId), 'stripe-subscription.json');
}

export function makeStripe(secretKey: string): Stripe {
  const config: Stripe.StripeConfig = {
    apiVersion: '2022-11-15',
    maxNetworkRetries: 5,
  };

  return new Stripe(secretKey, config);
}
