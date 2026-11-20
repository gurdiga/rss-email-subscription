// Restores the demo account’s sample feeds. make purge-demo-feeds runs
// it right after deleting whatever visitors left there, so the public
// demo always opens on something to look at.
//
// Every address is on a reserved domain (RFC 2606): the demo’s “send
// sample email” mails a feed’s Reply-To, and visitors can read the
// subscriber lists.

import { basename } from 'node:path';
import { getAccountIdByEmail } from '../domain/account-crypto';
import { AccountId, isAccountNotFound } from '../domain/account';
import { accountExists } from '../domain/account-storage';
import { makeEmailHashFn, makeHashedEmail, storeEmails } from '../app/email-sending/emails';
import { defaultFeedPattern } from '../domain/cron-pattern';
import { demoAccountEmail } from '../domain/demo-account';
import { makeEmailAddress } from '../domain/email-address-making';
import { FeedStatus, makeFullItemTextString } from '../domain/feed';
import { makeNewFeedHashingSalt } from '../domain/feed-crypto';
import { makeFeed } from '../domain/feed-making';
import { findFeedAccountId, storeFeed } from '../domain/feed-storage';
import { AppStorage } from '../domain/storage';
import { isErr, makeErr, Result } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { isRunDirectly } from '../shared/process-utils';
import { si } from '../shared/string-utils';
import { initApp } from './init-app';

async function main(): Promise<void> {
  const { logInfo, logError } = makeCustomLoggers({ module: basename(__filename) });
  const { storage, settings } = initApp();
  const result = seedDemoFeeds(storage, settings.hashingSalt);

  if (isErr(result)) {
    logError(si`Failed to ${seedDemoFeeds.name}: ${result.reason}`);
    process.exit(1);
  }

  logInfo(result);
}

export function seedDemoFeeds(storage: AppStorage, accountHashingSalt: string): Result<string> {
  const email = makeEmailAddress(demoAccountEmail);

  if (isErr(email)) {
    return makeErr(si`Invalid demo account email: ${email.reason}`);
  }

  const accountId = getAccountIdByEmail(email, accountHashingSalt);
  const exists = accountExists(storage, accountId);

  if (isErr(exists)) {
    return makeErr(si`Failed to check if the demo account exists: ${exists.reason}`);
  }

  // Otherwise the feeds land in a directory with no account.json.
  if (!exists) {
    return makeErr(si`Demo account not found: ${accountId.value}`);
  }

  const seededIds: string[] = [];

  for (const seed of demoFeedSeeds) {
    const result = seedDemoFeed(storage, accountId, seed);

    if (isErr(result)) {
      return makeErr(si`Failed to seed ${seed.id}: ${result.reason}`);
    }

    seededIds.push(seed.id);
  }

  return si`Seeded demo feeds: ${seededIds.join(', ')}`;
}

interface DemoFeedSeed {
  id: string;
  displayName: string;
  url: string;
  replyTo: string;
  subscribers: string[];
}

const demoFeedSeeds: DemoFeedSeed[] = [
  {
    id: 'demo-garden-notes',
    displayName: 'Garden Notes',
    url: 'https://example.com/garden/feed.xml',
    replyTo: 'garden-notes@example.com',
    subscribers: ['ana@example.com', 'ben@example.org', 'chloe@example.net', 'dan@example.com'],
  },
  {
    id: 'demo-weekly-recipes',
    displayName: 'Weekly Recipes',
    url: 'https://example.org/recipes/rss',
    replyTo: 'recipes@example.org',
    subscribers: ['eva@example.org', 'filip@example.net', 'gina@example.com'],
  },
];

function seedDemoFeed(storage: AppStorage, accountId: AccountId, seed: DemoFeedSeed): Result<void> {
  const feed = makeFeed({
    ...seed,
    hashingSalt: makeNewFeedHashingSalt().value,
    cronPattern: defaultFeedPattern.value,
    status: FeedStatus.Approved,
    emailBodySpec: makeFullItemTextString(),
  });

  if (isErr(feed)) {
    return makeErr(si`Invalid seed: ${feed.reason}`);
  }

  // Feed IDs are global, and a real feed might have claimed one of
  // these since the seed was written.
  const ownerId = findFeedAccountId(feed.id, storage);

  if (isErr(ownerId)) {
    return makeErr(si`Failed to ${findFeedAccountId.name}: ${ownerId.reason}`);
  }

  if (!isAccountNotFound(ownerId) && ownerId.value !== accountId.value) {
    return makeErr('Feed ID is taken by another account');
  }

  const storeFeedResult = storeFeed(accountId, feed, storage);

  if (isErr(storeFeedResult)) {
    return makeErr(si`Failed to ${storeFeed.name}: ${storeFeedResult.reason}`);
  }

  const emailHashFn = makeEmailHashFn(feed.hashingSalt);
  const hashedEmails = [];

  for (const subscriber of seed.subscribers) {
    const emailAddress = makeEmailAddress(subscriber);

    if (isErr(emailAddress)) {
      return makeErr(si`Invalid subscriber ${subscriber}: ${emailAddress.reason}`);
    }

    hashedEmails.push(makeHashedEmail(emailAddress, emailHashFn, true));
  }

  return storeEmails(hashedEmails, accountId, feed.id, storage);
}

if (isRunDirectly(module)) {
  main();
}
