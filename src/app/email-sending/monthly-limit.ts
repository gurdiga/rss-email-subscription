import { Account, AccountId } from '../../domain/account';
import { getAccountRootStorageKey } from '../../domain/account-storage';
import { AppSettings } from '../../domain/app-settings';
import { Feed } from '../../domain/feed';
import { Plan, Plans } from '../../domain/plan';
import { RssItem } from '../../domain/rss-item';
import { AppStorage, StorageKey } from '../../domain/storage';
import { isEmpty } from '../../shared/array-utils';
import { parseOptionalDate } from '../../shared/date-utils';
import { Result, isErr, makeErr, makeNumber } from '../../shared/lang';
import { makeCustomLoggers } from '../../shared/logging';
import { makePath } from '../../shared/path-utils';
import { si } from '../../shared/string-utils';
import { escapeHtml, htmlBody } from './email-content';
import { DeliverEmailFn, DeliveryInfo, EmailDeliveryEnv, deliverEmail, sendEmail } from './email-delivery';
import { ValidStoredRssItem, getStoredRssItemStorageKey } from './rss-item-reading';

export interface MonthlyEmailUsage {
  sentCount: number;
  limitNotificationTimestamp: Date | undefined;
}

// Returns the items to send. The others are deleted from the inbox for
// good: RSS checking has already moved past them, so nothing brings
// them back, not even next month.
export async function holdBackItemsOverMonthlyLimit<T extends { storedItem: ValidStoredRssItem }>(
  storage: AppStorage,
  env: EmailDeliveryEnv,
  settings: AppSettings,
  accountId: AccountId,
  account: Account,
  feed: Feed,
  items: T[],
  emailsPerItem: number,
  now: Date,
  deliverEmailFn: DeliverEmailFn = deliverEmail
): Promise<Result<T[]>> {
  const { logInfo, logWarning, logError } = makeCustomLoggers({
    module: holdBackItemsOverMonthlyLimit.name,
    accountId: accountId.value,
    feedId: feed.id.value,
  });

  const usage = loadMonthlyEmailUsage(storage, accountId, now);

  if (isErr(usage)) {
    return makeErr(si`Failed to ${loadMonthlyEmailUsage.name}: ${usage.reason}`);
  }

  const plan = Plans[account.planId];
  const { withinLimit, overLimit } = splitByMonthlyLimit(items, usage.sentCount, plan.maxEmailsPerMonth, emailsPerItem);

  if (isEmpty(overLimit)) {
    return withinLimit;
  }

  const sentCount = usage.sentCount + withinLimit.length * emailsPerItem;

  for (const { storedItem } of overLimit) {
    logWarning('Held back a post over the monthly plan limit', {
      planId: account.planId,
      maxEmailsPerMonth: plan.maxEmailsPerMonth,
      sentCount,
      fileName: storedItem.fileName,
      title: storedItem.item.title,
      link: storedItem.item.link.toString(),
    });

    const removeResult = storage.removeItem(getStoredRssItemStorageKey(accountId, feed.id, storedItem.fileName));

    if (isErr(removeResult)) {
      logError('Failed to remove a held-back item from the inbox', {
        reason: removeResult.reason,
        fileName: storedItem.fileName,
      });
    }
  }

  if (usage.limitNotificationTimestamp) {
    return withinLimit;
  }

  const firstHeldBackItem = overLimit[0]!.storedItem.item;
  const sendResult = await sendMonthlyLimitEmail(
    account,
    plan,
    sentCount,
    firstHeldBackItem,
    emailsPerItem,
    settings,
    env,
    now,
    deliverEmailFn
  );

  // The timestamp is recorded only once the email is out, so a failed
  // send is retried with the next held-back post.
  if (isErr(sendResult)) {
    logError(si`Failed to ${sendMonthlyLimitEmail.name}`, { reason: sendResult.reason });
    return withinLimit;
  }

  logInfo('Sent the monthly limit email', { to: account.email.value });

  // Re-read because the send yields, and a SIGHUP-triggered run of
  // another feed may have recorded emails in the meantime.
  const freshUsage = loadMonthlyEmailUsage(storage, accountId, now);

  if (isErr(freshUsage)) {
    logError(si`Failed to ${loadMonthlyEmailUsage.name}`, { reason: freshUsage.reason });
    return withinLimit;
  }

  const storeResult = storeMonthlyEmailUsage(
    storage,
    accountId,
    { ...freshUsage, limitNotificationTimestamp: now },
    now
  );

  if (isErr(storeResult)) {
    logError(si`Failed to ${storeMonthlyEmailUsage.name}`, { reason: storeResult.reason });
  }

  return withinLimit;
}

// An item goes out only if its whole send fits what is left of the
// month, so none is ever sent to part of the list.
export function splitByMonthlyLimit<T>(
  items: T[],
  sentCount: number,
  maxEmailsPerMonth: number,
  emailsPerItem: number
): { withinLimit: T[]; overLimit: T[] } {
  const withinLimit: T[] = [];
  const overLimit: T[] = [];
  let count = sentCount;

  for (const item of items) {
    if (count + emailsPerItem > maxEmailsPerMonth) {
      overLimit.push(item);
      continue;
    }

    withinLimit.push(item);
    count += emailsPerItem;
  }

  return { withinLimit, overLimit };
}

export function recordSentEmails(
  storage: AppStorage,
  accountId: AccountId,
  emailCount: number,
  now: Date
): Result<void> {
  if (emailCount === 0) {
    return;
  }

  const usage = loadMonthlyEmailUsage(storage, accountId, now);

  if (isErr(usage)) {
    return makeErr(si`Failed to ${loadMonthlyEmailUsage.name}: ${usage.reason}`);
  }

  return storeMonthlyEmailUsage(storage, accountId, { ...usage, sentCount: usage.sentCount + emailCount }, now);
}

export function loadMonthlyEmailUsage(storage: AppStorage, accountId: AccountId, now: Date): Result<MonthlyEmailUsage> {
  const storageKey = getMonthlyEmailUsageStorageKey(accountId, now);
  const exists = storage.hasItem(storageKey);

  if (isErr(exists)) {
    return makeErr(si`Failed to check if exists: ${exists.reason}`);
  }

  if (exists === false) {
    return { sentCount: 0, limitNotificationTimestamp: undefined };
  }

  const data = storage.loadItem(storageKey);

  if (isErr(data)) {
    return makeErr(si`Failed to load: ${data.reason}`);
  }

  const sentCount = makeNumber(data.sentCount, 'sentCount');

  if (isErr(sentCount)) {
    return sentCount;
  }

  const limitNotificationTimestamp = parseOptionalDate(data.limitNotificationTimestamp);

  if (isErr(limitNotificationTimestamp)) {
    return makeErr(si`Invalid limitNotificationTimestamp: ${limitNotificationTimestamp.reason}`);
  }

  return { sentCount, limitNotificationTimestamp };
}

function storeMonthlyEmailUsage(
  storage: AppStorage,
  accountId: AccountId,
  usage: MonthlyEmailUsage,
  now: Date
): Result<void> {
  return storage.storeItem(getMonthlyEmailUsageStorageKey(accountId, now), usage);
}

export function getMonthlyEmailUsageStorageKey(accountId: AccountId, now: Date): StorageKey {
  return makePath(getAccountRootStorageKey(accountId), 'email-usage', si`${getUtcMonth(now)}.json`);
}

export function getUtcMonth(date: Date): string {
  return date.toISOString().substring(0, 7); // 'YYYY-MM'
}

async function sendMonthlyLimitEmail(
  account: Account,
  plan: Plan,
  sentCount: number,
  heldBackItem: RssItem,
  subscriberCount: number,
  settings: AppSettings,
  env: EmailDeliveryEnv,
  now: Date,
  deliverEmailFn: DeliverEmailFn
): Promise<Result<DeliveryInfo>> {
  const usedCount = formatNumber(sentCount);
  const allowance = formatNumber(plan.maxEmailsPerMonth);
  const subscribers = subscriberCount === 1 ? '1 subscriber' : si`${formatNumber(subscriberCount)} subscribers`;
  const resetDate = getFirstDayOfNextUtcMonth(now).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const accountPageUrl = si`https://${env.DOMAIN_NAME}/user/account.html`;

  const emailContent = {
    subject: 'A post didn’t fit in your FeedSubscription monthly emails',
    htmlBody: htmlBody(si`
      <p>Hello,</p>

      <p>Your FeedSubscription account has used ${usedCount} of the
      ${allowance} emails in this month’s ${plan.title}. That isn’t
      enough to send “${escapeHtml(heldBackItem.title)}” to your
      ${subscribers}, so it wasn’t emailed.</p>

      <p>New posts that don’t fit in the remaining emails won’t be
      emailed, now or later. The count starts over on ${resetDate}.</p>

      <p>To keep sending, please choose a larger plan on the
      <a href="${accountPageUrl}">Account page</a>. If you have any
      other questions, just reply to this email.</p>

      <p>Have a nice day.</p>
    `),
  };

  const { fullEmailAddress } = settings;

  return await sendEmail(
    fullEmailAddress,
    account.email,
    fullEmailAddress.emailAddress,
    emailContent,
    env,
    deliverEmailFn
  );
}

function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}

export function getFirstDayOfNextUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}
