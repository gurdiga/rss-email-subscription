import { AppEnv } from '../../api/init-app';
import { AccountId, isAccountNotFound } from '../../domain/account';
import { loadAccount } from '../../domain/account-storage';
import { makeEmailAddress } from '../../domain/email-address-making';
import { Feed } from '../../domain/feed';
import { AppStorage } from '../../domain/storage';
import { isEmpty, isNotEmpty } from '../../shared/array-utils';
import { isErr } from '../../shared/lang';
import { makeCustomLoggers } from '../../shared/logging';
import { si } from '../../shared/string-utils';
import { loadEmailAddresses, makeFullEmailAddress } from './emails';
import { deliverItems } from './item-delivery';
import { readStoredRssItems } from './rss-item-reading';

export async function sendEmails(
  accountId: AccountId,
  feed: Feed,
  storage: AppStorage,
  env: AppEnv
): Promise<number | undefined> {
  const { logError, logInfo, logWarning } = makeCustomLoggers({
    module: 'email-sending',
    accountId: accountId.value,
    feedId: feed.id.value,
  });

  const account = loadAccount(storage, accountId);

  if (isErr(account)) {
    logError(si`Failed to ${loadAccount.name}`, { reason: account.reason });
    return 1;
  }

  if (isAccountNotFound(account)) {
    logError('Account not found');
    return 1;
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

  const storedRssItems = readStoredRssItems(accountId, feed.id, storage);

  if (isErr(storedRssItems)) {
    logError('Failed to read RSS items', { reason: storedRssItems.reason });
    return 1;
  }

  const { validItems, invalidItems } = storedRssItems;

  if (isNotEmpty(invalidItems)) {
    logWarning('Invalid stored RSS items', { invalidItems });
  }

  if (isEmpty(validItems)) {
    logInfo('No new RSS items');
  }

  const { validEmails, invalidEmails } = emailAddresses;

  if (isEmpty(validEmails) && invalidEmails.length > 0) {
    logError('No valid emails');
    return 1;
  }

  if (invalidEmails.length > 0) {
    logWarning('Invalid emails', { invalidEmails });
  }

  const confirmedEmails = validEmails.filter((email) => email.isConfirmed);

  return deliverItems(storage, env, accountId, feed, validItems, confirmedEmails, from);
}
