import { Environment, EventName, LogLevel, Paddle, TransactionNotification } from '@paddle/paddle-node-sdk';
import { RequestHandler } from 'express';
import { Account, AccountId, isAccountId, isAccountNotFound } from '../domain/account';
import {
  findAccountIdByPaddleCustomerId,
  getAccountRootStorageKey,
  isPaddleCustomerNotLinked,
  linkPaddleCustomer,
  PaddleCustomerNotLinked,
  loadAccount,
  storeAccount,
} from '../domain/account-storage';
import { EmailAddress } from '../domain/email-address';
import { makeDate } from '../shared/date-utils';
import { PlanId, Plans, isSubscriptionPlan, makeNotASubscriptionPlanErr, makePlanId } from '../domain/plan';
import {
  AccountSupportProductResponseData,
  Card,
  PaddleDataResponseData,
  PaddleEnvironment,
  PaddleCustomerId,
  PaddleKeysResponseData,
  makeCardDescription,
  makePaddleCustomerId,
} from '../domain/payment';
import { AppStorage, StorageKey } from '../domain/storage';
import { AppError, makeAppError, makeSuccess } from '../shared/api-response';
import { AppSettings } from '../domain/app-settings';
import { Result, asyncAttempt, hasKind, isErr, makeErr, makeNumber, makeString, makeValues } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { makePath } from '../shared/path-utils';
import { si } from '../shared/string-utils';
import { AppRequestHandler } from './app-request-handler';
import { App } from './init-app';
import { sendPlanChangeInformationEmail, sendWelcomeEmail } from './plan-change-email';

// Must match trial_period configured on Paddle subscription prices.
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
    environment: env.PADDLE_ENVIRONMENT,
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

export const accountSupportProduct: AppRequestHandler = async function accountSupportProduct(
  reqId,
  _reqBody,
  _reqParams,
  _reqSession,
  { env }
) {
  const { logError } = makeCustomLoggers({ module: accountSupportProduct.name, reqId });
  const paddle = makePaddle(env.PADDLE_API_KEY, env.PADDLE_ENVIRONMENT);

  const productsPage = await asyncAttempt(() => paddle.products.list({ perPage: 200 }).next());

  if (isErr(productsPage)) {
    logError(si`Failed to paddle.products.list: ${productsPage.reason}`);
    return makeAppError();
  }

  const product = productsPage.find(({ customData }) => {
    return customData?.['res_code'] === 'account_setup';
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

  const price = pricesPage[0];

  if (!price) {
    logError(si`No price found for account support product "${product.id}"`);
    return makeAppError();
  }

  const priceInCents = price.unitPrice ? parseInt(price.unitPrice.amount, 10) : 0;

  const responseData = makeAccountSupportProductResponseData({
    name: product.name,
    description: product.description,
    priceInCents,
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
  });
}

export interface PaddleTransactionId {
  kind: 'PaddleTransactionId';
  value: string;
}

function makePaddleTransactionId(value: string): PaddleTransactionId {
  return { kind: 'PaddleTransactionId', value };
}

// Links the customer to the account before creating the transaction, so that by
// the time anything can complete, its webhook resolves. Without that ordering the
// webhook would need some other way back to the account, and the only other one is
// the customer’s email, which can name an address someone else has since registered.
export async function createCustomerWithSubscription(
  paddle: Paddle,
  storage: AppStorage,
  accountId: AccountId,
  planId: PlanId
): Promise<Result<PaddleCustomerTaken | PaddleTransactionId>> {
  if (!isSubscriptionPlan(planId)) {
    return makeNotASubscriptionPlanErr(planId);
  }

  const account = loadAccount(storage, accountId);

  if (isErr(account)) {
    return makeErr(si`Failed to ${loadAccount.name}: ${account.reason}`);
  }

  if (isAccountNotFound(account)) {
    return makeErr(si`Account not found: ${accountId.value}`);
  }

  const customerId =
    account.paddleCustomerId ?? (await getOrAdoptPaddleCustomer(paddle, storage, accountId, account.email));

  if (isErr(customerId) || isPaddleCustomerTaken(customerId)) {
    return customerId;
  }

  const linkResult = linkPaddleCustomer(storage, accountId, customerId);

  if (isErr(linkResult)) {
    return makeErr(si`Failed to ${linkPaddleCustomer.name}: ${linkResult.reason}`);
  }

  if (isAccountNotFound(linkResult)) {
    return makeErr(si`Account disappeared before linking ${customerId.value}`);
  }

  const priceId = await getPaddlePriceIdForPlan(paddle, planId);

  if (isErr(priceId)) {
    return makeErr(si`Failed to ${getPaddlePriceIdForPlan.name}: ${priceId.reason}`);
  }

  const transaction = await asyncAttempt(() =>
    paddle.transactions.create({
      customerId: customerId.value,
      items: [{ priceId, quantity: 1 }],
      collectionMode: 'automatic',
      customData: { res_customer_email: account.email.value, res_plan_id: planId },
    })
  );

  if (isErr(transaction)) {
    return makeErr(si`Failed to paddle.transactions.create: ${transaction.reason}`);
  }

  return makePaddleTransactionId(transaction.id);
}

// For the billing states that only a person can untangle: a paid account with no
// linked customer, or a customer that can’t be adopted.
export function makeContactSupportError(settings: AppSettings): AppError {
  const supportAddress = settings.fullEmailAddress.emailAddress.value;

  return makeAppError(si`We couldn’t sort out billing for this account automatically. Please email ${supportAddress}.`);
}

export interface PaddleCustomerTaken {
  kind: 'PaddleCustomerTaken';
  reason: string;
}

export function isPaddleCustomerTaken(value: unknown): value is PaddleCustomerTaken {
  return hasKind(value, 'PaddleCustomerTaken');
}

// Paddle keeps one customer per email, so a registration at an address that already
// has one has to reuse it. That is safe only when the customer belongs to no one:
// not linked to another account, and not paying for a subscription that some
// deleted or renamed account left behind.
async function getOrAdoptPaddleCustomer(
  paddle: Paddle,
  storage: AppStorage,
  accountId: AccountId,
  email: EmailAddress
): Promise<Result<PaddleCustomerTaken | PaddleCustomerId>> {
  const existing = await findPaddleCustomerByEmail(paddle, email);

  if (isErr(existing)) {
    return makeErr(si`Failed to ${findPaddleCustomerByEmail.name}: ${existing.reason}`);
  }

  if (isCustomerNotFound(existing)) {
    const newCustomer = await asyncAttempt(() => paddle.customers.create({ email: email.value }));

    if (isErr(newCustomer)) {
      return makeErr(si`Failed to paddle.customers.create: ${newCustomer.reason}`);
    }

    return makePaddleCustomerId(newCustomer.id);
  }

  const customerId = makePaddleCustomerId(existing.id);

  if (isErr(customerId)) {
    return customerId;
  }

  const linkedAccountId = findAccountIdByPaddleCustomerId(storage, customerId);

  if (isErr(linkedAccountId)) {
    return makeErr(si`Failed to ${findAccountIdByPaddleCustomerId.name}: ${linkedAccountId.reason}`);
  }

  // Already ours when a double-submitted request linked it while this one awaited Paddle.
  if (isAccountId(linkedAccountId) && linkedAccountId.value === accountId.value) {
    return customerId;
  }

  if (!isPaddleCustomerNotLinked(linkedAccountId)) {
    return makePaddleCustomerTaken(si`${customerId.value} is linked to account ${linkedAccountId.value}`);
  }

  const subscriptions = await listLiveSubscriptions(paddle, customerId);

  if (isErr(subscriptions)) {
    return subscriptions;
  }

  if (subscriptions.length > 0) {
    const ids = subscriptions.map((x) => x.id).join(', ');

    return makePaddleCustomerTaken(si`${customerId.value} is unlinked but has live subscriptions: ${ids}`);
  }

  return customerId;
}

function makePaddleCustomerTaken(reason: string): PaddleCustomerTaken {
  return { kind: 'PaddleCustomerTaken', reason };
}

// Every status in which Paddle still holds a subscription open, not only the billable
// ones: a past-due or paused subscription still belongs to someone.
async function listLiveSubscriptions(paddle: Paddle, customerId: PaddleCustomerId) {
  const subscriptions = await asyncAttempt(() =>
    paddle.subscriptions
      .list({ customerId: [customerId.value], status: ['active', 'trialing', 'past_due', 'paused'] })
      .next()
  );

  if (isErr(subscriptions)) {
    return makeErr(si`Failed to paddle.subscriptions.list: ${subscriptions.reason}`);
  }

  return subscriptions;
}

interface CustomerNotFound {
  kind: 'CustomerNotFound';
}

function makeCustomerNotFound(): CustomerNotFound {
  return { kind: 'CustomerNotFound' };
}

export function isCustomerNotFound(value: unknown): value is CustomerNotFound {
  return hasKind(value, 'CustomerNotFound');
}

// For registration and the backfill only. Everything else goes by the customer ID
// stored on the account: the email on a Paddle customer is whatever it was when
// last synced, so it can name an address someone else has since registered.
export async function findPaddleCustomerByEmail(paddle: Paddle, email: EmailAddress) {
  const customers = await asyncAttempt(() => paddle.customers.list({ email: [email.value] }).next());

  if (isErr(customers)) {
    return makeErr(si`Failed to paddle.customers.list: ${customers.reason}`);
  }

  if (customers.length > 1) {
    const ids = customers.map((c) => c.id).join(', ');
    return makeErr(si`Multiple Paddle customers found for "${email.value}": ${ids}`);
  }

  return customers[0] ?? makeCustomerNotFound();
}

export async function changeCustomerSubscription(
  paddle: Paddle,
  customerId: PaddleCustomerId,
  planId: PlanId
): Promise<Result<void>> {
  if (!isSubscriptionPlan(planId)) {
    return makeNotASubscriptionPlanErr(planId);
  }

  const priceId = await getPaddlePriceIdForPlan(paddle, planId);

  if (isErr(priceId)) {
    return makeErr(si`Failed to ${getPaddlePriceIdForPlan.name}: ${priceId.reason}`);
  }

  const subscriptionsPage = await asyncAttempt(() =>
    paddle.subscriptions.list({ customerId: [customerId.value], status: ['active', 'trialing'] }).next()
  );

  if (isErr(subscriptionsPage)) {
    return makeErr(si`Failed to paddle.subscriptions.list: ${subscriptionsPage.reason}`);
  }

  const subscription = subscriptionsPage[0];

  if (!subscription) {
    return makeErr(si`No active subscription found for customer "${customerId.value}"`);
  }

  // Paddle requires 'do_not_bill' during trial; 'prorated_immediately' for active subscriptions.
  const prorationBillingMode = subscription.status === 'trialing' ? 'do_not_bill' : 'prorated_immediately';

  const updated = await asyncAttempt(() =>
    paddle.subscriptions.update(subscription.id, {
      items: [{ priceId, quantity: 1 }],
      prorationBillingMode,
    })
  );

  if (isErr(updated)) {
    return makeErr(si`Failed to paddle.subscriptions.update: ${updated.reason}`);
  }
}

export async function getPaymentMethodUpdateTransaction(
  paddle: Paddle,
  customerId: PaddleCustomerId
): Promise<Result<PaddleTransactionId>> {
  const subscriptionsPage = await asyncAttempt(() =>
    paddle.subscriptions.list({ customerId: [customerId.value], status: ['active', 'trialing'] }).next()
  );

  if (isErr(subscriptionsPage)) {
    return makeErr(si`Failed to paddle.subscriptions.list: ${subscriptionsPage.reason}`);
  }

  const subscription = subscriptionsPage[0];

  if (!subscription) {
    return makeErr(si`No active subscription found for customer "${customerId.value}"`);
  }

  const transaction = await asyncAttempt(() => paddle.subscriptions.getPaymentMethodChangeTransaction(subscription.id));

  if (isErr(transaction)) {
    return makeErr(si`Failed to paddle.subscriptions.getPaymentMethodChangeTransaction: ${transaction.reason}`);
  }

  return makePaddleTransactionId(transaction.id);
}

// Absence of anything to cancel is reported as NothingToCancel rather than Err. Callers
// differ on what it means: for a user-initiated deletion it is the expected case, but on
// the paid-to-free path a missing subscription is a real problem. Folding both into Err
// made every caller guess from the message text.
export async function cancelCustomerSubscription(
  paddle: Paddle,
  customerId: PaddleCustomerId
): Promise<Result<NothingToCancel | void>> {
  const subscriptionsPage = await asyncAttempt(() =>
    paddle.subscriptions.list({ customerId: [customerId.value], status: ['active', 'trialing'] }).next()
  );

  if (isErr(subscriptionsPage)) {
    return makeErr(si`Failed to paddle.subscriptions.list: ${subscriptionsPage.reason}`);
  }

  if (subscriptionsPage.length > 1) {
    const ids = subscriptionsPage.map((s) => s.id).join(', ');
    return makeErr(si`More than one active subscription found for "${customerId.value}": ${ids}`);
  }

  const subscription = subscriptionsPage[0];

  if (!subscription) {
    return makeNothingToCancel();
  }

  // Already ending at period end, as after a downgrade to Free. Paddle refuses to
  // cancel a subscription with a change pending, and repeating it would block both a
  // second downgrade and deleting the account until the period ran out.
  if (subscription.scheduledChange?.action === 'cancel') {
    return;
  }

  const result = await asyncAttempt(() =>
    paddle.subscriptions.cancel(subscription.id, { effectiveFrom: 'next_billing_period' })
  );

  if (isErr(result)) {
    return makeErr(si`Failed to paddle.subscriptions.cancel("${subscription.id}"): ${result.reason}`);
  }
}

// Read-only, for the cleanup sweep’s accounts that have no link: ones created before
// links were stored, and left unmatched by the backfill. The answer only decides
// whether deleting is safe; nothing is done to the customer it finds.
export async function checkLiveSubscriptionByEmail(
  paddle: Paddle,
  email: EmailAddress
): Promise<Result<NothingToCancel | LiveSubscriptionFound>> {
  const customer = await findPaddleCustomerByEmail(paddle, email);

  if (isErr(customer)) {
    return makeErr(si`Failed to ${findPaddleCustomerByEmail.name}: ${customer.reason}`);
  }

  if (isCustomerNotFound(customer)) {
    return makeNothingToCancel();
  }

  const customerId = makePaddleCustomerId(customer.id);

  if (isErr(customerId)) {
    return customerId;
  }

  const subscriptions = await listLiveSubscriptions(paddle, customerId);

  if (isErr(subscriptions)) {
    return subscriptions;
  }

  return subscriptions.length > 0 ? { kind: 'LiveSubscriptionFound' } : makeNothingToCancel();
}

export interface LiveSubscriptionFound {
  kind: 'LiveSubscriptionFound';
}

// Paddle mails receipts to this address, and registration refuses to adopt a
// customer still filed under someone else’s address. Nothing resolves accounts by it.
export async function updatePaddleCustomerEmail(
  paddle: Paddle,
  customerId: PaddleCustomerId,
  email: EmailAddress
): Promise<Result<void>> {
  const result = await asyncAttempt(() => paddle.customers.update(customerId.value, { email: email.value }));

  if (isErr(result)) {
    return makeErr(si`Failed to paddle.customers.update("${customerId.value}"): ${result.reason}`);
  }
}

export interface NothingToCancel {
  kind: 'NothingToCancel';
}

function makeNothingToCancel(): NothingToCancel {
  return { kind: 'NothingToCancel' };
}

export function isNothingToCancel(value: unknown): value is NothingToCancel {
  return hasKind(value, 'NothingToCancel');
}

type PaddlePriceId = string;

async function getPaddlePriceIdForPlan(paddle: Paddle, planId: PlanId): Promise<Result<PaddlePriceId>> {
  if (!isSubscriptionPlan(planId)) {
    return makeNotASubscriptionPlanErr(planId);
  }

  const pricesPage = await asyncAttempt(() => paddle.prices.list({ perPage: 200 }).next());

  if (isErr(pricesPage)) {
    return makeErr(si`Failed to paddle.prices.list: ${pricesPage.reason}`);
  }

  const price = pricesPage.find((p) => p.customData?.['res_plan_id'] === planId);

  if (!price) {
    return makeErr(si`Price not found for plan "${planId}"`);
  }

  return price.id;
}

export function makePaddle(apiKey: string, paddleEnvironment: PaddleEnvironment): Paddle {
  const environment = paddleEnvironment === 'production' ? Environment.production : Environment.sandbox;

  return new Paddle(apiKey, {
    environment,
    logLevel: LogLevel.none,
  });
}

export function paddleWebhookHandler(app: App): RequestHandler {
  return async (req, res) => {
    const { logError, logInfo, logWarning } = makeCustomLoggers({ module: 'paddleWebhook' });

    // Express types headers as string | string[] | undefined; take the first
    // value since Paddle always sends a single signature header.
    const rawSig = req.headers['paddle-signature'];
    const signature = Array.isArray(rawSig) ? rawSig[0] : rawSig;

    if (!signature) {
      logWarning('Missing Paddle-Signature header');
      res.status(400).send('Missing signature');
      return;
    }

    if (!Buffer.isBuffer(req.body)) {
      logWarning('Expected raw body buffer');
      res.status(400).send('Invalid body');
      return;
    }

    const rawBody = req.body;
    const paddle = makePaddle(app.env.PADDLE_API_KEY, app.env.PADDLE_ENVIRONMENT);

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

    const occurredAt = makeDate(event.occurredAt);

    if (isErr(occurredAt)) {
      logError(si`Invalid occurredAt on Paddle webhook: ${occurredAt.reason}`, { eventId: event.eventId });
      res.status(500).send('Internal error');
      return;
    }

    let result: Result<void>;

    if (event.eventType === EventName.TransactionCompleted) {
      result = handleTransactionCompleted(app, event.data, occurredAt);
    } else if (event.eventType === EventName.SubscriptionCanceled) {
      result = handleSubscriptionCanceled(app, event.data.customerId, occurredAt);
    } else {
      result = undefined;
    }

    if (isErr(result)) {
      res.status(500).send('Internal error');
      return;
    }

    res.status(200).send('OK');
  };
}

// Plan and card writes happen with no await between the account’s load and its store,
// so two webhooks for one account can’t interleave there. The emails go out after.
export function handleTransactionCompleted(
  app: App,
  transaction: TransactionNotification,
  occurredAt: Date
): Result<void> {
  const { logError, logInfo, logWarning } = makeCustomLoggers({ module: handleTransactionCompleted.name });

  if (!transaction.customerId) {
    logWarning('transaction.completed webhook has no customerId');
    return;
  }

  const accountId = findWebhookAccountId(app.storage, transaction.customerId);

  if (isErr(accountId)) {
    logError(si`Failed to ${findWebhookAccountId.name}: ${accountId.reason}`);
    return accountId;
  }

  if (isPaddleCustomerNotLinked(accountId)) {
    logInfo('Ignoring transaction.completed for a deleted account', { customerId: transaction.customerId });
    return;
  }

  const purchasedPlanId = getPurchasedPlanId(transaction);

  // The transaction's plan data was anomalous (multiple plans tagged, or an invalid
  // or non-subscription res_plan_id), already logged inside getPurchasedPlanId —
  // that leaves the plan data unresolved, so treating the same transaction's card
  // data as trustworthy is a separate judgment call this function doesn't make either.
  if (isPlanDataAnomaly(purchasedPlanId)) {
    return;
  }

  const account = loadAccount(app.storage, accountId);

  if (isErr(account)) {
    return makeErr(si`Failed to ${loadAccount.name} for ${accountId.value}: ${account.reason}`);
  }

  if (isAccountNotFound(account)) {
    return makeErr(si`Account ${accountId.value} disappeared during transaction.completed`);
  }

  // A card-only transaction, from a payment-method update, says nothing about the
  // plan, so it neither checks nor moves the plan-event watermark: moving it would
  // drop a checkout completion delivered after it as stale.
  if (!purchasedPlanId) {
    return maybeStoreCardDetails(app, transaction, accountId, account.email);
  }

  if (isStaleEvent(account, occurredAt)) {
    logInfo('Ignoring a transaction.completed older than the last applied plan event', {
      accountId: accountId.value,
      occurredAt: occurredAt.toISOString(),
    });
    return;
  }

  // Before the account store: once that records this event, a retry is ignored as
  // stale, so a card write that failed after it would never be retried.
  const cardResult = maybeStoreCardDetails(app, transaction, accountId, account.email);

  if (isErr(cardResult)) {
    return cardResult;
  }

  const { email } = account;
  const newPlanId = purchasedPlanId;
  const storeResult = storeAccount(app.storage, accountId, {
    ...account,
    planId: newPlanId,
    lastPaddlePlanEventAt: occurredAt,
  });

  if (isErr(storeResult)) {
    return makeErr(si`Failed to ${storeAccount.name} for ${email.value}: ${storeResult.reason}`);
  }

  if (newPlanId === account.planId) {
    return;
  }

  logInfo(si`Upgraded ${email.value} from ${account.planId} to ${newPlanId}`);

  if (account.planId === PlanId.PendingPayment) {
    sendWelcomeEmail(email, app.settings, app.env);
  } else {
    const oldPlanTitle = Plans[account.planId].title;
    const newPlanTitle = Plans[newPlanId].title;

    sendPlanChangeInformationEmail(oldPlanTitle, newPlanTitle, email, app.settings, app.env);
  }
}

export function handleSubscriptionCanceled(app: App, customerId: string, occurredAt: Date): Result<void> {
  const { logError, logInfo } = makeCustomLoggers({ module: handleSubscriptionCanceled.name });
  const accountId = findWebhookAccountId(app.storage, customerId);

  if (isErr(accountId)) {
    logError(si`Failed to ${findWebhookAccountId.name}: ${accountId.reason}`);
    return accountId;
  }

  // The expected end of a deleted paid account: its cancellation took effect.
  if (isPaddleCustomerNotLinked(accountId)) {
    logInfo('Ignoring subscription.canceled for a deleted account', { customerId });
    return;
  }

  const account = loadAccount(app.storage, accountId);

  if (isErr(account)) {
    logError(si`Failed to ${loadAccount.name} for ${accountId.value}: ${account.reason}`);
    return makeErr(si`Failed to load account ${accountId.value}: ${account.reason}`);
  }

  if (isAccountNotFound(account)) {
    return makeErr(si`Account ${accountId.value} disappeared during subscription.canceled`);
  }

  if (isStaleEvent(account, occurredAt)) {
    logInfo('Ignoring a subscription.canceled older than the last applied plan event', {
      accountId: accountId.value,
      occurredAt: occurredAt.toISOString(),
    });
    return;
  }

  const { email } = account;

  // Only a paid plan has anything to end. A pending account stays pending: the
  // subscription it was waiting on is gone, so there is nothing to grant. Recording
  // the event still matters there, so that the purchase it cancels, if delivered
  // after it, is ignored as stale rather than upgrading the account.
  const isDowngrade = account.planId !== PlanId.Free && account.planId !== PlanId.PendingPayment;
  const newPlanId = isDowngrade ? PlanId.Free : account.planId;
  const storeResult = storeAccount(app.storage, accountId, {
    ...account,
    planId: newPlanId,
    lastPaddlePlanEventAt: occurredAt,
  });

  if (isErr(storeResult)) {
    logError(si`Failed to ${storeAccount.name} for ${email.value}: ${storeResult.reason}`);
    return makeErr(si`Failed to store account for ${email.value}: ${storeResult.reason}`);
  }

  if (!isDowngrade) {
    logInfo(si`Account for ${email.value} is on ${account.planId}; nothing to downgrade`);
    return;
  }

  logInfo(si`Downgraded ${email.value} to Free after external subscription cancellation`);

  const oldPlanTitle = Plans[account.planId].title;
  const newPlanTitle = Plans[PlanId.Free].title;

  sendPlanChangeInformationEmail(oldPlanTitle, newPlanTitle, email, app.settings, app.env);
}

// Paddle doesn’t guarantee delivery order and retries can repeat an event, so each
// account records when its last applied plan event occurred and anything not newer
// is dropped. That keeps a renewal delivered late from undoing a later cancellation.
function isStaleEvent(account: Account, occurredAt: Date): boolean {
  return !!account.lastPaddlePlanEventAt && occurredAt.getTime() <= account.lastPaddlePlanEventAt.getTime();
}

// An unresolvable customer is an error, so the webhook answers 500 and Paddle
// retries: a 200 would drop the event. The likely cause is an account whose link
// hasn’t been written yet, which the deploy’s backfill does. The one customer
// let through unlinked is a deleted account’s, whose events have nowhere to go.
function findWebhookAccountId(storage: AppStorage, rawCustomerId: string): Result<PaddleCustomerNotLinked | AccountId> {
  const customerId = makePaddleCustomerId(rawCustomerId);

  if (isErr(customerId)) {
    return customerId;
  }

  const accountId = findAccountIdByPaddleCustomerId(storage, customerId);

  if (isErr(accountId)) {
    return makeErr(si`Failed to ${findAccountIdByPaddleCustomerId.name}: ${accountId.reason}`);
  }

  if (isPaddleCustomerNotLinked(accountId) && !accountId.isOfDeletedAccount) {
    return makeErr(si`No account is linked to Paddle customer ${customerId.value}`);
  }

  return accountId;
}

interface PlanDataAnomaly {
  kind: 'PlanDataAnomaly';
}

function makePlanDataAnomaly(): PlanDataAnomaly {
  return { kind: 'PlanDataAnomaly' };
}

function isPlanDataAnomaly(value: unknown): value is PlanDataAnomaly {
  return hasKind(value, 'PlanDataAnomaly');
}

function getPurchasedPlanId(transaction: TransactionNotification): PlanDataAnomaly | PlanId | undefined {
  const { logError, logInfo } = makeCustomLoggers({ module: getPurchasedPlanId.name });

  // The plan comes from the price Paddle actually billed (each Price is
  // tagged with its plan via its own customData, set from the Paddle
  // dashboard), not from the transaction's checkout customData — Paddle lets
  // the buyer's browser set that value, so trusting it would let a cheap
  // purchase claim an expensive plan.
  const purchasedPlanIds = [
    ...new Set(
      transaction.items
        .map((item) => item.price?.customData?.['res_plan_id'])
        .filter((planId): planId is string => typeof planId === 'string')
    ),
  ];

  if (purchasedPlanIds.length > 1) {
    logError(si`transaction.completed webhook has items for multiple plans: ${purchasedPlanIds.join(', ')}`);
    return makePlanDataAnomaly();
  }

  const rawPlanId = purchasedPlanIds[0];

  if (!rawPlanId) {
    // Legitimate for a payment-method-update transaction, which has no plan
    // price; logged at info level so it stays distinguishable in prod from a
    // real plan price that unexpectedly lost its res_plan_id tag.
    const priceIds = transaction.items.map((item) => item.price?.id ?? '[no price]').join(', ');
    logInfo(si`No plan tag on purchased prices: ${priceIds}`, { customerId: transaction.customerId });
    return;
  }

  const newPlanId = makePlanId(rawPlanId);

  if (isErr(newPlanId)) {
    logError(si`Invalid res_plan_id on purchased price: "${rawPlanId}"`);
    return makePlanDataAnomaly();
  }

  if (!Plans[newPlanId].isSubscription) {
    logError(si`Non-subscription res_plan_id on purchased price: "${rawPlanId}"`);
    return makePlanDataAnomaly();
  }

  return newPlanId;
}

function maybeStoreCardDetails(
  app: App,
  transaction: TransactionNotification,
  accountId: AccountId,
  email: EmailAddress
): Result<void> {
  const { logError, logInfo } = makeCustomLoggers({ module: maybeStoreCardDetails.name });
  const methodDetails = transaction.payments?.[0]?.methodDetails;

  if (!(methodDetails?.type === 'card' && methodDetails.card)) {
    return;
  }

  const { type, last4, expiryMonth, expiryYear } = methodDetails.card;

  // The SDK types these as always present, but that's a claim about the response
  // shape it expects, not a guarantee about what Paddle actually sends. A
  // fabricated last4 or expiry would look exactly like a real one to a customer
  // checking which card is on file — worse than showing nothing — so an invalid
  // field skips storing a description entirely rather than filling one in. On an
  // account with an existing description this leaves the old one in place rather
  // than clearing it: it's more likely still accurate than not, since this is
  // Paddle sending bad data, not necessarily evidence the card itself changed.
  const invalidCardFields = [
    !type && 'type',
    !last4 && 'last4',
    !expiryMonth && 'expiryMonth',
    !expiryYear && 'expiryYear',
  ].filter((field): field is string => field !== false);

  if (invalidCardFields.length > 0) {
    logError(si`Skipping card description, Paddle sent invalid card fields: ${invalidCardFields.join(', ')}`);
    return;
  }

  const card: Card = { brand: type, last4, exp_month: expiryMonth, exp_year: expiryYear };
  const description = makeCardDescription(card);
  const storeResult = app.storage.storeItem(getCardDescriptionStorageKey(accountId), description);

  if (isErr(storeResult)) {
    return makeErr(si`Failed to store card description for ${email.value}: ${storeResult.reason}`);
  }

  logInfo(si`Stored card description for ${email.value}`);
}
