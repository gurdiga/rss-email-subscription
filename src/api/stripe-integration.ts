import Stripe from 'stripe';
import { AccountId } from '../domain/account';
import { getAccountRootStorageKey } from '../domain/account-storage';
import { EmailAddress } from '../domain/email-address';
import { PlanId, isSubscriptionPlan, makeNotASubscriptionPlanErr } from '../domain/plan';
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
  hasKind,
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
import { isEmpty } from '../shared/array-utils';

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

const trialPeriodDays = 30;

export const stripeData: AppRequestHandler = async function stripeData(
  _reqId,
  _reqBody,
  _reqParams,
  _reqSession,
  _app
) {
  return makeSuccess(
    'Stripe data',
    {},
    {
      trialPeriodDays,
    }
  );
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

export function getStripeCardDescriptionStorageKey(accountId: AccountId): StorageKey {
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

export interface StripeClientSecret {
  kind: 'StripeClientSecret';
  value: string;
}

function makeStripeClientSecret(value: string): StripeClientSecret {
  return {
    kind: 'StripeClientSecret',
    value,
  };
}

export async function createCustomerWithSubscription(
  stripe: Stripe,
  email: EmailAddress,
  planId: PlanId
): Promise<Result<StripeClientSecret>> {
  if (!isSubscriptionPlan(planId)) {
    return makeNotASubscriptionPlanErr(planId);
  }

  const customer = await getOrCreateStripeCustomer(stripe, email);

  if (isErr(customer)) {
    return makeErr(si`Failed to ${getOrCreateStripeCustomer.name}: ${customer.reason}`);
  }

  const clientSecret = await createStripeSubscription(stripe, customer, planId);

  if (isErr(clientSecret)) {
    return makeErr(si`Failed to ${createStripeSubscription.name}: ${clientSecret.reason}`);
  }

  return clientSecret;
}

async function getOrCreateStripeCustomer(stripe: Stripe, email: EmailAddress): Promise<Result<Stripe.Customer>> {
  const existingCustomer = await findStripeCustomerByEmail(stripe, email);

  if (isErr(existingCustomer)) {
    return makeErr(si`Failed to ${findStripeCustomerByEmail.name}: ${existingCustomer.reason}`);
  }

  if (!isCustomerNotFound(existingCustomer)) {
    return existingCustomer;
  }

  const newCustomer = await asyncAttempt(() => stripe.customers.create({ email: email.value }));

  if (isErr(newCustomer)) {
    return makeErr(si`Failed to stripe.customers.create: ${newCustomer.reason}`);
  }

  return newCustomer;
}

interface CustomerNotFound {
  kind: 'CustomerNotFound';
}

function makeCustomerNotFound(): CustomerNotFound {
  return { kind: 'CustomerNotFound' };
}

function isCustomerNotFound(value: unknown): value is CustomerNotFound {
  return hasKind(value, 'CustomerNotFound');
}

async function getStripeCustomerByEmail(stripe: Stripe, email: EmailAddress): Promise<Result<Stripe.Customer>> {
  const customer = await findStripeCustomerByEmail(stripe, email);

  if (isCustomerNotFound(customer)) {
    return makeErr(si`Customer not found by email "${email.value}"`);
  }

  return customer;
}

async function findStripeCustomerByEmail(
  stripe: Stripe,
  email: EmailAddress
): Promise<Result<Stripe.Customer | CustomerNotFound>> {
  const searchResults = await asyncAttempt(() =>
    stripe.customers.search({
      query: si`email:"${email.value}"`,
      expand: ['data.subscriptions'],
    })
  );

  if (isErr(searchResults)) {
    return makeErr(si`Failed to stripe.customers.search: ${searchResults.reason}`);
  }

  const firstExistingCustomer = searchResults.data[0];

  if (!firstExistingCustomer) {
    return makeCustomerNotFound();
  }

  return firstExistingCustomer;
}

export async function changeCustomerSubscription(stripe: Stripe, email: EmailAddress, planId: PlanId) {
  if (!isSubscriptionPlan(planId)) {
    return makeNotASubscriptionPlanErr(planId);
  }

  const customer = await getStripeCustomerByEmail(stripe, email);

  if (isErr(customer)) {
    return makeErr(si`Failed to ${findStripeCustomerByEmail.name}: ${customer.reason}`);
  }

  const activeSubscriptions = getCustomerActiveSubscriptions(customer);

  if (isErr(activeSubscriptions)) {
    return makeErr(si`Failed to ${getCustomerActiveSubscriptions.name}: ${activeSubscriptions.reason}`);
  }

  for (const { id } of activeSubscriptions) {
    const result = await asyncAttempt(() => stripe.subscriptions.cancel(id));

    if (isErr(result)) {
      return makeErr(si`Failed to stripe.subscriptions.cancel("${id}"): ${result.reason}`);
    }
  }

  const result = await createStripeSubscription(stripe, customer, planId);

  if (isErr(result)) {
    return makeErr(si`Failed to ${createStripeSubscription.name}: ${result.reason}`);
  }

  return result;
}

function getCustomerActiveSubscriptions(customer: Stripe.Customer): Result<Stripe.Subscription[]> {
  const subscriptions = customer.subscriptions?.data;

  if (!subscriptions) {
    return makeErr('Customer without expanded subscriptions');
  }

  if (isEmpty(subscriptions)) {
    return makeErr('Customer to change subscription has none');
  }

  const eligibleStatuses: Stripe.Subscription.Status[] = ['active', 'trialing'];
  const activeSubscriptions = subscriptions.filter((x) => eligibleStatuses.includes(x.status));

  if (isEmpty(activeSubscriptions)) {
    return makeErr(si`Customer to change subscription has none ${eligibleStatuses.join(' or ')}`);
  }

  return activeSubscriptions;
}

export async function createStripeSubscription(
  stripe: Stripe,
  customer: Stripe.Customer,
  planId: PlanId
): Promise<Result<StripeClientSecret>> {
  if (!isSubscriptionPlan(planId)) {
    return makeNotASubscriptionPlanErr(planId);
  }

  const priceId = await getStripePriceIdForPlan(stripe, planId);

  if (isErr(priceId)) {
    return makeErr(si`Failed to ${getStripePriceIdForPlan.name}: ${priceId.reason}`);
  }

  const subscription = await asyncAttempt(() =>
    stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: priceId }],
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['pending_setup_intent'],
      metadata: { res_customer_email: customer.email },
      trial_period_days: trialPeriodDays,
    })
  );

  if (isErr(subscription)) {
    return makeErr(
      si`Failed to stripe.subscriptions.create(customerId: "${customer.id}", priceId: "${priceId}"): ${subscription.reason}`
    );
  }

  const clientSecret = getClientSecretFromSubscription(subscription);

  if (isErr(clientSecret)) {
    return makeErr(si`Failed to ${getClientSecretFromSubscription.name}: ${clientSecret.reason}`);
  }

  return clientSecret;
}

type StripePriceId = string;

async function getStripePriceIdForPlan(stripe: Stripe, planId: PlanId): Promise<Result<StripePriceId>> {
  if (!isSubscriptionPlan(planId)) {
    return makeNotASubscriptionPlanErr(planId);
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

  return price.id;
}

async function searchCustomerSubscriptions(
  stripe: Stripe,
  email: EmailAddress,
  status: Stripe.Subscription.Status
): Promise<Result<Stripe.Subscription[]>> {
  const query = si`status:'${status}' AND metadata['res_customer_email']:'${email.value}'`;
  const searchResults = await asyncAttempt(() => stripe.subscriptions.search({ query: query }));

  if (isErr(searchResults)) {
    return makeErr(si`Failed to stripe.subscriptions.search({query: "${query}"}): "${searchResults.reason}"`);
  }

  return searchResults.data;
}

export async function cancelCustomerSubscription(
  stripe: Stripe,
  customerEmail: EmailAddress
): Promise<Result<Stripe.Subscription>> {
  const activeSubscriptions = await searchCustomerSubscriptions(stripe, customerEmail, 'active');

  if (isErr(activeSubscriptions)) {
    return makeErr(
      si`Failed to ${searchCustomerSubscriptions.name}('${customerEmail.value}', 'active'): ${activeSubscriptions.reason}`
    );
  }

  const trialSubscriptions = await searchCustomerSubscriptions(stripe, customerEmail, 'trialing');

  if (isErr(trialSubscriptions)) {
    return makeErr(
      si`Failed to ${searchCustomerSubscriptions.name}('${customerEmail.value}', 'trialing'): ${trialSubscriptions.reason}`
    );
  }

  const subscriptions = activeSubscriptions.concat(trialSubscriptions);

  if (subscriptions.length > 1) {
    const subscriptionIds = subscriptions.map((x) => si`${x.id} => ${x.status}`).join(', ');

    return makeErr(si`More than one subscriptions found to cancel for ${customerEmail.value}: ${subscriptionIds}`);
  }

  const subscription = subscriptions[0];

  if (!subscription) {
    return makeErr(si`No subscription found to cancel for ${customerEmail.value}`);
  }

  const result = await asyncAttempt(() => stripe.subscriptions.cancel(subscription.id));

  if (isErr(result)) {
    return makeErr(si`Failed to stripe.subscriptions.cancel("${subscription.id}"): ${result.reason}`);
  }

  const expectedStatus = 'canceled';

  if (result.status !== expectedStatus) {
    return makeErr(
      si`Subscription status for "${subscription.id}" is "${result.status}" instead of "${expectedStatus}"`
    );
  }

  return subscription;
}

function getClientSecretFromSubscription(subscription: Stripe.Subscription): Result<StripeClientSecret> {
  const setupIntent = subscription.pending_setup_intent;

  if (!isObject(setupIntent)) {
    return makeErr(si`Non-object subscription.pending_setup_intent: ${JSON.stringify(setupIntent)}`);
  }

  const clientSecret = setupIntent.client_secret;

  if (clientSecret === null) {
    return makeErr(si`Null subscription.pending_setup_intent.client_secret`);
  }

  return makeStripeClientSecret(clientSecret);
}

export function makeStripe(secretKey: string): Stripe {
  const config: Stripe.StripeConfig = {
    apiVersion: '2024-04-10',
    maxNetworkRetries: 5,
  };

  return new Stripe(secretKey, config);
}
