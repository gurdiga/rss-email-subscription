import Stripe from 'stripe';
import { AccountId } from '../domain/account';
import { getAccountRootStorageKey } from '../domain/account-storage';
import { EmailAddress } from '../domain/email-address';
import { PlanId, isPaidPlan } from '../domain/plan';
import { AppStorage, StorageKey } from '../domain/storage';
import {
  AccountSupportProductResponseData,
  StoreCardRequest,
  StripeKeysResponseData,
  makeCardDescription,
  stripePaymentMethodTypes,
} from '../domain/stripe-integration';
import { makeAppError, makeInputError, makeNotAuthenticatedError, makeSuccess } from '../shared/api-response';
import {
  Result,
  asyncAttempt,
  isErr,
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

export function getStripeSubscriptionItemStorageKey(accountId: AccountId): StorageKey {
  return makePath(getAccountRootStorageKey(accountId), 'stripe-subscription-item-id.json');
}

export function makeStripe(secretKey: string): Stripe {
  const config: Stripe.StripeConfig = {
    apiVersion: '2022-11-15',
    maxNetworkRetries: 5,
  };

  return new Stripe(secretKey, config);
}
