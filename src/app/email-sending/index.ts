import { AccountId, isAccountNotFound } from '../../domain/account';
import { loadAccount } from '../../domain/account-storage';
import { makeEmailAddress } from '../../domain/email-address-making';
import { Feed } from '../../domain/feed';
import { isFeedNotFound } from '../../domain/feed-storage';
import { Plans } from '../../domain/plan';
import { AppStorage } from '../../domain/storage';
import { isEmpty, isNotEmpty } from '../../shared/array-utils';
import { requireEnv } from '../../shared/env';
import { isErr } from '../../shared/lang';
import { makeCustomLoggers } from '../../shared/logging';
import { si } from '../../shared/string-utils';
import { EmailDeliveryEnv } from './email-delivery';
import { loadEmailAddresses, makeFullEmailAddress } from './emails';
import { deliverItems } from './item-delivery';
import { readStoredRssItems } from './rss-item-reading';

export async function sendEmails(accountId: AccountId, feed: Feed, storage: AppStorage): Promise<number | undefined> {
  const deliveryId = new Date().toISOString().replace(/[:.]/g, '');
  const { logError, logInfo, logWarning } = makeCustomLoggers({
    module: 'email-sending',
    accountId: accountId.value,
    feedId: feed.id.value,
    deliveryId,
  });

  const env = requireEnv<EmailDeliveryEnv>(['SMTP_CONNECTION_STRING', 'DOMAIN_NAME']);

  if (isErr(env)) {
    logError('Invalid environment variables', { reason: env.reason });
    return 1;
  }

  const account = loadAccount(storage, accountId);

  if (isErr(account)) {
    logError(si`Failed to ${loadAccount.name}`, { reason: account.reason });
    return 1;
  }

  if (isAccountNotFound(account)) {
    logError('Account not found');
    return 1;
  }

  const plan = Plans[account.planId];
  const storedRssItems = readStoredRssItems(accountId, feed.id, storage);

  if (isErr(storedRssItems)) {
    logError('Failed to read RSS items', { reason: storedRssItems.reason });
    return 1;
  }

  const { validItems, invalidItems } = storedRssItems;

  if (isNotEmpty(invalidItems)) {
    logWarning('Invalid RSS items', { invalidItems });
  }

  if (isEmpty(validItems)) {
    logInfo('No new RSS items');
  }

  const fromAddress = makeEmailAddress(si`${feed.id.value}@${env.DOMAIN_NAME}`);

  if (isErr(fromAddress)) {
    logError('Failed to build fromAddress', { reason: fromAddress.reason });
    return;
  }

  const from = makeFullEmailAddress(feed.displayName, fromAddress);
  const emailAddresses = loadEmailAddresses(accountId, feed.id, storage);

  if (isErr(emailAddresses)) {
    logError('Could not read emails', { reason: emailAddresses.reason });
    return 1;
  }

  if (isFeedNotFound(emailAddresses)) {
    logError('Feed not found');
    return 1;
  }

  const { validEmails, invalidEmails } = emailAddresses;

  if (isEmpty(validEmails)) {
    logError('No valid emails');
    return 1;
  }

  if (invalidEmails.length > 0) {
    logWarning('Invalid emails', { invalidEmails });
  }

  const confirmedEmails = validEmails.filter((email) => email.isConfirmed);

  return deliverItems(storage, env, accountId, feed, plan, validItems, confirmedEmails, fromAddress, deliveryId, from);
}
