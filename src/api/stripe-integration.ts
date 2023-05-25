import Stripe from 'stripe';
import { makeEmailAddress } from '../domain/email-address-making';
import { AppStorage, StorageKey } from '../domain/storage';
import {
  CreateCustomerRequest,
  CreateCustomerRequestData,
  CreateSubscriptionRequest,
  CreateSubscriptionRequestData,
  CreateSubscriptionResponse,
  StripeConfigResponseData as StripeKeysResponseData,
} from '../domain/stripe-integration';
import { makeAppError, makeInputError, makeSuccess } from '../shared/api-response';
import { asyncAttempt, isErr, makeString, makeValues } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
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

export const createCustomer: AppRequestHandler = async function createCustomer(
  reqId,
  reqBody,
  _reqParams,
  _reqSession,
  { env, storage }
) {
  const { logError } = makeCustomLoggers({ module: createCustomer.name, reqId });
  const request = makeCreateCustomerRequest(reqBody);

  if (isErr(request)) {
    logError(si`Failed to ${makeCreateCustomerRequest.name}: ${request.reason}`, { reqBody });
    return makeInputError('Invalid request');
  }

  const stripe = makeStripe(env.STRIPE_SECRET_KEY);
  const customer = await stripe.customers.create({
    email: request.email.value,
  });

  const storeCustomerResult = storeStripeCustomer(storage, customer);

  if (isErr(storeCustomerResult)) {
    logError(si`Failed to ${storeStripeCustomer.name}: ${storeCustomerResult.reason}`, { customer });
    return makeAppError();
  }

  // TODO: Define the desired response.

  return makeAppError('Not implemented');
};

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

function makeCreateCustomerRequest(data: unknown | CreateCustomerRequestData) {
  return makeValues<CreateCustomerRequest>(data, {
    email: makeEmailAddress,
  });
}

export const createSubscription: AppRequestHandler = async function createSubscription(
  reqId,
  reqBody,
  _reqParams,
  _reqSession,
  { env }
) {
  const { logError } = makeCustomLoggers({ module: createSubscription.name, reqId });
  const request = makeCreateSubscriptionRequest(reqBody);

  if (isErr(request)) {
    logError(si`Failed to ${makeCreateSubscriptionRequest.name}: ${request.reason}`, { reqBody });
    return makeInputError('Invalid request');
  }

  const stripe = makeStripe(env.STRIPE_SECRET_KEY);
  const attachResult = await asyncAttempt(() =>
    stripe.paymentMethods.attach(request.paymentMethodId, {
      customer: request.customerId,
    })
  );

  if (isErr(attachResult)) {
    logError(si`Failed to stripe.paymentMethods.attach`, { reason: attachResult.reason });
    return makeAppError();
  }

  const updateCustomerResult = await asyncAttempt(() =>
    stripe.customers.update(request.customerId, {
      invoice_settings: {
        default_payment_method: request.paymentMethodId,
      },
    })
  );

  if (isErr(updateCustomerResult)) {
    logError(si`Failed to stripe.customers.update`, { reason: updateCustomerResult.reason });
    return makeAppError();
  }

  const subscription = await asyncAttempt(() =>
    stripe.subscriptions.create({
      customer: request.customerId,
      items: [{ price: process.env[request.priceId] }],
      expand: ['latest_invoice.payment_intent', 'pending_setup_intent'],
    })
  );

  if (isErr(subscription)) {
    logError(si`Failed to stripe.subscriptions.create`, { reason: subscription.reason });
    return makeAppError();
  }

  const logData = {};
  const responseData: CreateSubscriptionResponse = {
    subscription,
  };

  return makeSuccess('Stripe subscription', logData, responseData);
};

function makeCreateSubscriptionRequest(data: unknown | CreateSubscriptionRequestData) {
  return makeValues<CreateSubscriptionRequest>(data, {
    paymentMethodId: makeString,
    customerId: makeString,
    priceId: makeString,
  });
}

function makeStripe(secretKey: string): Stripe {
  const config: Stripe.StripeConfig = {
    apiVersion: '2022-11-15',
    maxNetworkRetries: 5,
  };

  return new Stripe(secretKey, config);
}
