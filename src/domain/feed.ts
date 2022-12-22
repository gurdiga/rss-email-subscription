import { EmailAddress, makeEmailAddress } from '../app/email-sending/emails';
import { getRandomString } from '../shared/crypto';
import { isErr, isObject, isString, makeErr, Result } from '../shared/lang';
import { hasKind } from '../shared/lang';
import { AppStorage } from '../shared/storage';
import { makeUrl } from '../shared/url';
import { AccountId, loadAccount } from './account';
import { cronPatternBySchedule } from './cron-pattern';

export interface Feed {
  kind: 'Feed';
  displayName: string;
  url: URL;
  hashingSalt: string;
  fromAddress: EmailAddress;
  replyTo: EmailAddress;
  cronPattern: string;
}

export function isFeed(value: unknown): value is Feed {
  return hasKind(value, 'Feed');
}

export interface FeedNotFound {
  kind: 'FeedNotFound';
  feedId: string;
}

export function isFeedNotFound(value: unknown): value is FeedNotFound {
  return hasKind(value, 'FeedNotFound');
}

export const feedRootStorageKey = '/feeds';

export function getFeedStorageKey(feedId: string) {
  return `${feedRootStorageKey}/${feedId}`;
}

export function getFeed(feedId: string, storage: AppStorage, domainName: string): Result<Feed | FeedNotFound> {
  const storageKey = `${getFeedStorageKey(feedId)}/feed.json`;

  if (!storage.hasItem(storageKey)) {
    return { kind: 'FeedNotFound', feedId };
  }

  const data = storage.loadItem(storageKey);
  const displayName = data.displayName || feedId;
  const url = makeUrl(data.url);

  if (isErr(url)) {
    return makeErr(`Invalid feed URL in ${storageKey}: ${data.url}`);
  }

  const defaultCrontPattern = '0 * * * *';
  const { hashingSalt, cronPattern = defaultCrontPattern } = data;
  const saltMinLength = 16;

  if (typeof hashingSalt !== 'string') {
    return makeErr(`Invalid hashing salt in ${storageKey}: ${hashingSalt}`);
  }

  if (hashingSalt.trim().length < saltMinLength) {
    return makeErr(
      `Hashing salt is too short in ${storageKey}: at least ${saltMinLength} non-space characters required`
    );
  }

  const fromAddress = makeEmailAddress(`${feedId}@${domainName}`);

  if (isErr(fromAddress)) {
    return makeErr(`Invalid "fromAddress" in ${storageKey}: ${fromAddress.reason}`);
  }

  const defaultReplyTo = `feedback@${domainName}`;
  const replyTo = makeEmailAddress(data.replyTo || defaultReplyTo);

  if (isErr(replyTo)) {
    return makeErr(`Invalid "replyTo" address in ${storageKey}: ${replyTo.reason}`);
  }

  return {
    kind: 'Feed',
    displayName,
    url,
    hashingSalt,
    fromAddress,
    replyTo,
    cronPattern,
  };
}

export interface FeedsByAccountId {
  validFeeds: Feed[];
  missingFeeds: FeedNotFound[];
  errs: string[];
}

export function getFeedsByAccountId(
  accountId: AccountId,
  storage: AppStorage,
  domainName: string,
  loadAccountFn = loadAccount,
  getFeedFn = getFeed
): Result<FeedsByAccountId> {
  const account = loadAccountFn(storage, accountId);

  if (isErr(account)) {
    return makeErr(`Failed to ${loadAccount.name}: ${account.reason}`);
  }

  const loadedFeeds = account.feedIds.map((feedId) => getFeedFn(feedId, storage, domainName));
  const validFeeds = loadedFeeds.filter(isFeed);
  const missingFeeds = loadedFeeds.filter(isFeedNotFound);
  const errs = loadedFeeds.filter(isErr).map((x) => x.reason);

  return { validFeeds, errs, missingFeeds };
}

export interface MakeFeedInput {
  displayName?: string | any;
  url?: string | any;
  emailName?: string | any;
  replyTo?: string | any;
  schedule?: string | any;
}

export function makeFeed(input: MakeFeedInput, domainName: string, getRandomStringFn = getRandomString): Result<Feed> {
  if (!isObject(input)) {
    return makeErr('Invalid input');
  }

  const displayName = makeFeedDisplayName(input.displayName);

  if (isErr(displayName)) {
    return displayName;
  }

  const url = makeUrl(input.url);

  if (isErr(url)) {
    return makeErr('Invalid feed URL', 'url');
  }

  const fromAddress = makeFeedFromAddress(input.emailName, domainName);

  if (isErr(fromAddress)) {
    return fromAddress;
  }

  const replyTo = makeEmailAddress(input.replyTo);

  if (isErr(replyTo)) {
    return makeErr('Invalid Reply To email', 'replyTo');
  }

  const cronPattern = cronPatternBySchedule[input.schedule];

  if (!cronPattern) {
    return makeErr('Invalid schedule', 'schedule');
  }

  const hashingSalt = getRandomStringFn();

  return {
    kind: 'Feed',
    displayName,
    url,
    hashingSalt,
    fromAddress,
    replyTo,
    cronPattern,
  };
}

function makeFeedDisplayName(input: any): Result<string> {
  if (!isString(input) || input.trim().length < 5) {
    return makeErr('Invalid feed displayName', 'displayName');
  }

  return input.trim();
}

function makeFeedFromAddress(input: string | any, domainName: string): Result<EmailAddress> {
  const err = makeErr('Invalid email name', 'emailName');

  if (!isString(input)) {
    return err;
  }

  const fromAddress = makeEmailAddress(`${input}@${domainName}`);

  if (isErr(fromAddress)) {
    return err;
  }

  return fromAddress;
}
