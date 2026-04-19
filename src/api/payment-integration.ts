import { Environment, EventName, LogLevel, Paddle } from '@paddle/paddle-node-sdk';
import { RequestHandler } from 'express';
import { AccountId, isAccountNotFound } from '../domain/account';
import { getAccountRootStorageKey, loadAccount, storeAccount } from '../domain/account-storage';
import { EmailAddress } from '../domain/email-address';
import { makeEmailAddress } from '../domain/email-address-making';
import { PlanId, Plans, isSubscriptionPlan, makeNotASubscriptionPlanErr } from '../domain/plan';
import {
  AccountSupportProductResponseData,
  Card,
  PaddleDataResponseData,
  PaddleKeysResponseData,
  StoreCardRequest,
  makeCardDescription,
} from '../domain/payment';
import { AppStorage, StorageKey } from '../domain/storage';
import { makeAppError, makeInputError, makeNotAuthenticatedError, makeSuccess } from '../shared/api-response';
import {
  Result,
  asyncAttempt,
  hasKind,
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
import { App } from './init-app';
import { sendPlanChangeInformationEmail } from './plan-change-email';
import { checkSession, isAuthenticatedSession } from './session';
import { getAccountIdByEmail } from '../domain/account-crypto';

const trialPeriodDays = 30;

export const paddleKeys: AppRequestHandler = async function paddleKeys(
  _reqId,
  _reqBody,
  _reqParams,
  _reqSession,
  { env }
) {
  const responseData: PaddleKeysResponseData = {
    clientToken: env.PADDLE_CLIENT_TOKEN,
  };

  return makeSuccess('Paddle keys', {}, responseData);
};

export const paddleData: AppRequestHandler = async function paddleData(
  _reqId,
  _reqBody,
  _reqParams,
  _reqSession,
  _app
) {
  const responseData: PaddleDataResponseData = { trialPeriodDays };

  return makeSuccess('Paddle data', {}, responseData);
};

export const storeCardDescription: AppRequestHandler = async function storeCardDescription(
  reqId,
  reqBody,
  _reqParams,
  reqSession,
  { storage }
) {
  const { logWarning, logError } = makeCustomLoggers({ module: storeCardDescription.name, reqId });
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
  const storeResult = storeCardDescriptionItem(storage, accountId, cardDescription);

  if (isErr(storeResult)) {
    logError(si`Failed to ${storeCardDescriptionItem.name}: ${storeResult.reason}`);
    return makeAppError();
  }

  return makeSuccess('Card description stored', {}, {});
};

function storeCardDescriptionItem(storage: AppStorage, accountId: AccountId, cardDescription: string): Result<void> {
  return storage.storeItem(getCardDescriptionStorageKey(accountId), cardDescription);
}

export function loadCardDescription(storage: AppStorage, accountId: AccountId): Result<string | undefined> {
  const storageKey = getCardDescriptionStorageKey(accountId);
  const exists = storage.hasItem(storageKey);

  if (isErr(exists)) {
    return makeErr(si`Failed to check if item exists: ${exists.reason}`);
  }

  if (exists === false) {
    return;
  }

  return storage.loadItem(storageKey);
}

export function getCardDescriptionStorageKey(accountId: AccountId): StorageKey {
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
  const paddle = makePaddle(env.PADDLE_API_KEY);

  const productsPage = await asyncAttempt(() => paddle.products.list().next());

  if (isErr(productsPage)) {
    logError(si`Failed to paddle.products.list: ${productsPage.reason}`);
    return makeAppError();
  }

  const product = productsPage.find((p: any) => {
    const cd = p.customData as Record<string, string> | null;
    return cd?.['res_code'] === 'account_setup';
  });

  if (!product) {
    logError('Account support product not found in Paddle');
    return makeAppError();
  }

  const pricesPage = await asyncAttempt(() => paddle.prices.list({ productId: [product.id] }).next());

  if (isErr(pricesPage)) {
    logError(si`Failed to paddle.prices.list: ${pricesPage.reason}`);
    return makeAppError();
  }

  const price = pricesPage[0] as any;

  if (!price) {
    logError(si`No price found for account support product "${product.id}"`);
    return makeAppError();
  }

  // Payment links are not manageable via the Paddle Node SDK; the URL is fetched
  // at build time by the feedsubscription.com Makefile and stored in payment_link.json.
  // At runtime, the API returns what is known from the product/price only.
  const priceInCents = price.unitPrice ? parseInt(price.unitPrice.amount as string, 10) : 0;

  const responseData = makeAccountSupportProductResponseData({
    name: product.name,
    description: product.description,
    priceInCents,
    paymentLinkUrl: '',
  });

  if (isErr(responseData)) {
    logError(si`Failed to ${makeAccountSupportProductResponseData.name}: ${responseData.reason}`);
    return makeAppError();
  }

  return makeSuccess('Account Support product', {}, responseData);
};

function makeAccountSupportProductResponseData(data: unknown): Result<AccountSupportProductResponseData> {
  return makeValues<AccountSupportProductResponseData>(data, {
    name: makeString,
    description: makeString,
    priceInCents: makeNumber,
    paymentLinkUrl: makeString,
  });
}

export interface PaddleTransactionId {
  kind: 'PaddleTransactionId';
  value: string;
}

function makePaddleTransactionId(value: string): PaddleTransactionId {
  return { kind: 'PaddleTransactionId', value };
}

export async function createCustomerWithSubscription(
  paddle: Paddle,
  email: EmailAddress,
  planId: PlanId
): Promise<Result<PaddleTransactionId>> {
  if (!isSubscriptionPlan(planId)) {
    return makeNotASubscriptionPlanErr(planId);
  }

  const customer = await getOrCreatePaddleCustomer(paddle, email);

  if (isErr(customer)) {
    return makeErr(si`Failed to ${getOrCreatePaddleCustomer.name}: ${customer.reason}`);
  }

  const priceId = await getPaddlePriceIdForPlan(paddle, planId);

  if (isErr(priceId)) {
    return makeErr(si`Failed to ${getPaddlePriceIdForPlan.name}: ${priceId.reason}`);
  }

  const transaction = await asyncAttempt(() =>
    paddle.transactions.create({
      customerId: (customer as any).id,
      items: [{ priceId, quantity: 1 }],
      collectionMode: 'automatic',
      customData: { res_customer_email: email.value },
    })
  );

  if (isErr(transaction)) {
    return makeErr(si`Failed to paddle.transactions.create: ${transaction.reason}`);
  }

  return makePaddleTransactionId((transaction as any).id);
}

async function getOrCreatePaddleCustomer(paddle: Paddle, email: EmailAddress) {
  const existing = await findPaddleCustomerByEmail(paddle, email);

  if (isErr(existing)) {
    return makeErr(si`Failed to ${findPaddleCustomerByEmail.name}: ${existing.reason}`);
  }

  if (!isCustomerNotFound(existing)) {
    return existing;
  }

  const newCustomer = await asyncAttempt(() => paddle.customers.create({ email: email.value }));

  if (isErr(newCustomer)) {
    return makeErr(si`Failed to paddle.customers.create: ${newCustomer.reason}`);
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

async function findPaddleCustomerByEmail(paddle: Paddle, email: EmailAddress) {
  const page = await asyncAttempt(() => paddle.customers.list({ search: email.value }).next());

  if (isErr(page)) {
    return makeErr(si`Failed to paddle.customers.list: ${page.reason}`);
  }

  const customer = page[0];

  return customer ?? makeCustomerNotFound();
}

export async function changeCustomerSubscription(
  paddle: Paddle,
  email: EmailAddress,
  planId: PlanId
): Promise<Result<void>> {
  if (!isSubscriptionPlan(planId)) {
    return makeNotASubscriptionPlanErr(planId);
  }

  const customer = await findPaddleCustomerByEmail(paddle, email);

  if (isErr(customer)) {
    return makeErr(si`Failed to ${findPaddleCustomerByEmail.name}: ${customer.reason}`);
  }

  if (isCustomerNotFound(customer)) {
    return makeErr(si`Customer not found for email "${email.value}"`);
  }

  const priceId = await getPaddlePriceIdForPlan(paddle, planId);

  if (isErr(priceId)) {
    return makeErr(si`Failed to ${getPaddlePriceIdForPlan.name}: ${priceId.reason}`);
  }

  const subscriptionsPage = await asyncAttempt(() =>
    paddle.subscriptions.list({ customerId: [(customer as any).id], status: ['active', 'trialing'] }).next()
  );

  if (isErr(subscriptionsPage)) {
    return makeErr(si`Failed to paddle.subscriptions.list: ${subscriptionsPage.reason}`);
  }

  const subscription = subscriptionsPage[0] as any;

  if (!subscription) {
    return makeErr(si`No active subscription found for customer "${(customer as any).id}"`);
  }

  const updated = await asyncAttempt(() =>
    paddle.subscriptions.update(subscription.id, {
      items: [{ priceId, quantity: 1 }],
      prorationBillingMode: 'prorated_immediately',
    })
  );

  if (isErr(updated)) {
    return makeErr(si`Failed to paddle.subscriptions.update: ${updated.reason}`);
  }
}

export async function cancelCustomerSubscription(paddle: Paddle, email: EmailAddress): Promise<Result<void>> {
  const customer = await findPaddleCustomerByEmail(paddle, email);

  if (isErr(customer)) {
    return makeErr(si`Failed to ${findPaddleCustomerByEmail.name}: ${customer.reason}`);
  }

  if (isCustomerNotFound(customer)) {
    return makeErr(si`Customer not found for email "${email.value}"`);
  }

  const subscriptionsPage = await asyncAttempt(() =>
    paddle.subscriptions.list({ customerId: [(customer as any).id], status: ['active', 'trialing'] }).next()
  );

  if (isErr(subscriptionsPage)) {
    return makeErr(si`Failed to paddle.subscriptions.list: ${subscriptionsPage.reason}`);
  }

  if (subscriptionsPage.length > 1) {
    const ids = subscriptionsPage.map((s: any) => s.id).join(', ');
    return makeErr(si`More than one active subscription found for "${email.value}": ${ids}`);
  }

  const subscription = subscriptionsPage[0] as any;

  if (!subscription) {
    return makeErr(si`No active subscription found to cancel for "${email.value}"`);
  }

  const result = await asyncAttempt(() =>
    paddle.subscriptions.cancel(subscription.id, { effectiveFrom: 'next_billing_period' })
  );

  if (isErr(result)) {
    return makeErr(si`Failed to paddle.subscriptions.cancel("${subscription.id}"): ${result.reason}`);
  }
}

type PaddlePriceId = string;

async function getPaddlePriceIdForPlan(paddle: Paddle, planId: PlanId): Promise<Result<PaddlePriceId>> {
  if (!isSubscriptionPlan(planId)) {
    return makeNotASubscriptionPlanErr(planId);
  }

  const page = await asyncAttempt(() => paddle.prices.list().next());

  if (isErr(page)) {
    return makeErr(si`Failed to paddle.prices.list: ${page.reason}`);
  }

  const price = page.find((p: any) => {
    const cd = p.customData as Record<string, string> | null;
    return cd?.['res_plan_id'] === planId;
  });

  if (!price) {
    return makeErr(si`Price not found for plan "${planId}"`);
  }

  return (price as any).id;
}

export function makePaddle(apiKey: string): Paddle {
  const environment = process.env['NODE_ENV'] === 'production' ? Environment.production : Environment.sandbox;

  return new Paddle(apiKey, {
    environment,
    logLevel: LogLevel.none,
  });
}

export function paddleWebhookHandler(app: App): RequestHandler {
  return async (req, res) => {
    const { logError, logInfo, logWarning } = makeCustomLoggers({ module: 'paddleWebhook' });
    const signature = req.headers['paddle-signature'] as string | undefined;

    if (!signature) {
      logWarning('Missing Paddle-Signature header');
      res.status(400).send('Missing signature');
      return;
    }

    const paddle = makePaddle(app.env.PADDLE_API_KEY);
    const rawBody = req.body as Buffer;

    const event = await asyncAttempt(() =>
      paddle.webhooks.unmarshal(rawBody.toString(), app.env.PADDLE_WEBHOOK_SECRET, signature)
    );

    if (isErr(event)) {
      logError(si`Failed to unmarshal Paddle webhook: ${event.reason}`);
      res.status(400).send('Invalid signature');
      return;
    }

    if (!event) {
      logWarning('Empty Paddle webhook event');
      res.status(400).send('Empty event');
      return;
    }

    logInfo(si`Paddle webhook event: ${event.eventType}`);

    if (event.eventType === EventName.TransactionCompleted) {
      const transaction = event.data;
      const payment = transaction.payments?.[0];
      const methodDetails = payment?.methodDetails;

      if (methodDetails?.type === 'card' && methodDetails.card) {
        const { type, last4, expiryMonth, expiryYear } = methodDetails.card;
        const customData = transaction.customData as Record<string, string> | null;
        const customerEmail = customData?.['res_customer_email'];

        if (!customerEmail) {
          logWarning('transaction.completed webhook missing res_customer_email in customData');
        } else {
          const emailResult = makeEmailAddress(customerEmail);

          if (isErr(emailResult)) {
            logError(si`Invalid customer email in webhook customData: ${customerEmail}`);
          } else {
            const accountId = getAccountIdByEmail(emailResult, app.settings.hashingSalt);
            const card: Card = {
              brand: type ?? 'unknown',
              last4: last4 ?? '0000',
              exp_month: expiryMonth ?? 1,
              exp_year: expiryYear ?? 2099,
            };
            const description = makeCardDescription(card);
            const storeResult = app.storage.storeItem(getCardDescriptionStorageKey(accountId), description);

            if (isErr(storeResult)) {
              logError(si`Failed to store card description for ${customerEmail}: ${storeResult.reason}`);
            } else {
              logInfo(si`Stored card description for ${customerEmail}`);
            }
          }
        }
      }
    } else if (event.eventType === EventName.SubscriptionCanceled) {
      await handleSubscriptionCanceled(app, paddle, event.data.customerId);
    }

    res.status(200).send('OK');
  };
}

async function handleSubscriptionCanceled(app: App, paddle: Paddle, customerId: string): Promise<void> {
  const { logError, logInfo, logWarning } = makeCustomLoggers({ module: handleSubscriptionCanceled.name });

  const customer = await asyncAttempt(() => paddle.customers.get(customerId));

  if (isErr(customer)) {
    logError(si`Failed to paddle.customers.get("${customerId}"): ${customer.reason}`);
    return;
  }

  const email = makeEmailAddress(customer.email);

  if (isErr(email)) {
    logError(si`Invalid customer email from Paddle: "${customer.email}": ${email.reason}`);
    return;
  }

  const accountId = getAccountIdByEmail(email, app.settings.hashingSalt);
  const account = loadAccount(app.storage, accountId);

  if (isErr(account)) {
    logError(si`Failed to ${loadAccount.name} for ${email.value}: ${account.reason}`);
    return;
  }

  if (isAccountNotFound(account)) {
    logWarning(si`Account not found for canceled subscription: ${email.value}`);
    return;
  }

  if (account.planId === PlanId.Free) {
    logInfo(si`Account for ${email.value} already on Free plan; skipping`);
    return;
  }

  const oldPlanTitle = Plans[account.planId].title;
  const newPlanTitle = Plans[PlanId.Free].title;
  const storeResult = storeAccount(app.storage, accountId, { ...account, planId: PlanId.Free });

  if (isErr(storeResult)) {
    logError(si`Failed to ${storeAccount.name} for ${email.value}: ${storeResult.reason}`);
    return;
  }

  logInfo(si`Downgraded ${email.value} to Free after external subscription cancellation`);

  await sendPlanChangeInformationEmail(oldPlanTitle, newPlanTitle, email, app.settings, app.env);
}
