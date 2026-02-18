// Sends confirmation emails to all unconfirmed subscribers of a feed.
//
// Usage (from the api container):
//   node dist/api/send-confirmation-emails-cli.js <feedId>
//
// Example:
//   node dist/api/send-confirmation-emails-cli.js HCHBblog

import { basename } from 'node:path';
import {
  loadEmailAddresses,
  makeEmailHashFn,
  makeHashedEmail,
  makeFullEmailAddress,
} from '../app/email-sending/emails';
import { sendEmail } from '../app/email-sending/email-delivery';
import { makeEmailAddress } from '../domain/email-address-making';
import { makeFeedId } from '../domain/feed-id';
import { findFeedAccountId, loadFeed, isFeedNotFound } from '../domain/feed-storage';
import { isAccountNotFound } from '../domain/account';
import { isErr } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { getFirstCliArg, isRunDirectly } from '../shared/process-utils';
import { si } from '../shared/string-utils';
import { makeEmailConfirmationUrl, makeSubscriptionConfirmationEmailContent } from './subscription';
import { initApp } from './init-app';

async function main(): Promise<void> {
  const { logInfo, logError } = makeCustomLoggers({ module: basename(__filename) });
  const firstCliArg = getFirstCliArg(process);

  if (!firstCliArg) {
    logError('First argument is required: feedId');
    process.exit(1);
  }

  const feedId = makeFeedId(firstCliArg);

  if (isErr(feedId)) {
    logError(si`Invalid feedId: ${feedId.reason}`);
    process.exit(1);
  }

  const { storage, env } = initApp();

  const accountId = findFeedAccountId(feedId, storage);

  if (isErr(accountId)) {
    logError(si`Failed to find feed account: ${accountId.reason}`);
    process.exit(1);
  }

  if (isAccountNotFound(accountId)) {
    logError(si`Feed account not found for feedId: ${feedId.value}`);
    process.exit(1);
  }

  const feed = loadFeed(accountId, feedId, storage);

  if (isErr(feed)) {
    logError(si`Failed to load feed: ${feed.reason}`);
    process.exit(1);
  }

  if (isFeedNotFound(feed)) {
    logError(si`Feed not found: ${feedId.value}`);
    process.exit(1);
  }

  const emailsResult = loadEmailAddresses(accountId, feedId, storage);

  if (isErr(emailsResult)) {
    logError(si`Failed to load email addresses: ${emailsResult.reason}`);
    process.exit(1);
  }

  const unconfirmedEmails = emailsResult.validEmails.filter((e) => !e.isConfirmed);

  logInfo(si`Sending confirmation emails to ${unconfirmedEmails.length} unconfirmed subscriber(s)`);

  const fromAddress = makeEmailAddress(si`${feed.id.value}@${env.DOMAIN_NAME}`);

  if (isErr(fromAddress)) {
    logError(si`Failed to make from address: ${fromAddress.reason}`);
    process.exit(1);
  }

  const emailHashFn = makeEmailHashFn(feed.hashingSalt);
  const from = makeFullEmailAddress(feed.displayName, fromAddress);
  let successCount = 0;

  for (const storedEmail of unconfirmedEmails) {
    const hashedEmail = makeHashedEmail(storedEmail.emailAddress, emailHashFn);
    const confirmationLink = makeEmailConfirmationUrl(hashedEmail, feedId, feed.displayName, env.DOMAIN_NAME);
    const emailContent = makeSubscriptionConfirmationEmailContent(feed.displayName, confirmationLink, fromAddress);
    const result = await sendEmail(from, storedEmail.emailAddress, feed.replyTo, emailContent, env);

    if (isErr(result)) {
      logError(si`Failed to send to ${storedEmail.emailAddress.value}: ${result.reason}`);
    } else {
      logInfo(si`Sent to ${storedEmail.emailAddress.value}`);
      successCount++;
    }
  }

  logInfo(si`Done: ${successCount}/${unconfirmedEmails.length} sent`);
}

if (isRunDirectly(module)) {
  main();
}
