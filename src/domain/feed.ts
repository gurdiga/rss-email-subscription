import { EmailAddress, makeEmailAddress } from '../app/email-sending/emails';
import { getRandomString } from '../shared/crypto';
import { isErr, isObject, isString, makeErr, Result } from '../shared/lang';
import { hasKind } from '../shared/lang';
import { AppStorage } from '../shared/storage';
import { si } from '../shared/string-utils';
import { makePath } from '../shared/path-utils';
import { makeUrl } from '../shared/url';
import { AccountId, loadAccount } from './account';
import { cronPatternBySchedule } from './cron-pattern';

export interface Feed {
  kind: 'Feed';
  id: FeedId;
  displayName: string;
  url: URL;
  hashingSalt: string;
  fromAddress: EmailAddress;
  replyTo: EmailAddress;
  cronPattern: string;
}

export interface FeedStoredData {
  displayName: string;
  url: string;
  hashingSalt: string;
  cronPattern: string;
  replyTo: string;
}

export interface FeedNotFound {
  kind: 'FeedNotFound';
  feedId: FeedId;
}

export function isFeedNotFound(value: unknown): value is FeedNotFound {
  return hasKind(value, 'FeedNotFound');
}

export const feedRootStorageKey = '/feeds';

export function getFeedStorageKey(feedId: FeedId) {
  return makePath(feedRootStorageKey, feedId.value);
}

export function getFeedJsonStorageKey(feedId: FeedId) {
  return makePath(getFeedStorageKey(feedId), 'feed.json');
}

export function storeFeed(feed: Feed, storage: AppStorage): Result<void> {
  const storageKey = getFeedJsonStorageKey(feed.id);
  const data: FeedStoredData = {
    displayName: feed.displayName,
    url: feed.url.toString(),
    hashingSalt: feed.hashingSalt,
    cronPattern: feed.cronPattern,
    replyTo: feed.replyTo.value,
  };

  const result = storage.storeItem(storageKey, data);

  if (isErr(result)) {
    return makeErr(si`Failed to store feed data: ${result.reason}`);
  }
}

export function getFeed(feedId: FeedId, storage: AppStorage, domainName: string): Result<Feed | FeedNotFound> {
  const storageKey = getFeedJsonStorageKey(feedId);

  if (!storage.hasItem(storageKey)) {
    return { kind: 'FeedNotFound', feedId };
  }

  const data = storage.loadItem(storageKey);
  const displayName = data.displayName || feedId.value;
  const url = makeUrl(data.url);

  if (isErr(url)) {
    return makeErr(si`Invalid feed URL in ${storageKey}: ${data.url}`);
  }

  const defaultCrontPattern = cronPatternBySchedule['@hourly'];
  const { hashingSalt, cronPattern = defaultCrontPattern } = data;
  const saltMinLength = 16;

  if (typeof hashingSalt !== 'string') {
    return makeErr(si`Invalid hashing salt in ${storageKey}: ${hashingSalt}`);
  }

  if (hashingSalt.trim().length < saltMinLength) {
    return makeErr(
      si`Hashing salt is too short in ${storageKey}: at least ${saltMinLength} non-space characters required`
    );
  }

  const fromAddress = makeEmailAddress(si`${feedId.value}@${domainName}`);

  if (isErr(fromAddress)) {
    return makeErr(si`Invalid "fromAddress" in ${storageKey}: ${fromAddress.reason}`);
  }

  const defaultReplyTo = si`feedback@${domainName}`;
  const replyTo = makeEmailAddress(data.replyTo || defaultReplyTo);

  if (isErr(replyTo)) {
    return makeErr(si`Invalid "replyTo" address in ${storageKey}: ${replyTo.reason}`);
  }

  return {
    kind: 'Feed',
    id: feedId,
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
    return makeErr(si`Failed to ${loadAccount.name}: ${account.reason}`);
  }

  const loadedFeeds = account.feedIds.map((feedId) => getFeedFn(feedId, storage, domainName));
  const validFeeds = loadedFeeds.filter(isFeed);
  const missingFeeds = loadedFeeds.filter(isFeedNotFound);
  const errs = loadedFeeds.filter(isErr).map((x) => x.reason);

  return { validFeeds, errs, missingFeeds };
}

export interface MakeFeedInput {
  displayName?: string;
  url?: string;
  feedId?: string;
  replyTo?: string;
  schedule?: string;
}

export function makeFeed(input: MakeFeedInput, domainName: string, getRandomStringFn = getRandomString): Result<Feed> {
  if (!isObject(input)) {
    return makeErr('Invalid input');
  }

  const displayName = makeFeedDisplayName(input.displayName);

  if (isErr(displayName)) {
    return displayName;
  }

  const id = makeFeedId(input.feedId);

  if (isErr(id)) {
    return makeErr('Invalid feed ID', 'feedId');
  }

  if (!isString(input.url)) {
    return makeErr('Non-string feed URL', 'url');
  }

  const url = makeUrl(input.url);

  if (isErr(url)) {
    return makeErr('Invalid feed URL', 'url');
  }

  const fromAddress = makeFeedFromAddress(input.feedId, domainName);

  if (isErr(fromAddress)) {
    return fromAddress;
  }

  const replyTo = makeEmailAddress(input.replyTo);

  if (isErr(replyTo)) {
    return makeErr('Invalid Reply To email', 'replyTo');
  }

  if (!input.schedule) {
    return makeErr('Missing schedule', 'schedule');
  }

  const cronPattern = cronPatternBySchedule[input.schedule];

  if (!cronPattern) {
    return makeErr('Invalid schedule', 'schedule');
  }

  const hashingSalt = getRandomStringFn();

  return {
    kind: 'Feed',
    id,
    displayName,
    url,
    hashingSalt,
    fromAddress,
    replyTo,
    cronPattern,
  };
}

function makeFeedDisplayName(input: any): Result<string> {
  // TODO: Limit max length. 50?
  if (!isString(input) || input.trim().length < 5) {
    return makeErr('Invalid feed display name', 'displayName');
  }

  return input.trim();
}

function makeFeedFromAddress(input: string | any, domainName: string): Result<EmailAddress> {
  const err = makeErr('Invalid email name', 'feedId');

  // TODO: Add more validation:
  // - min/max lenght
  // - trim spaces
  // TODO: return feedId?

  if (!isString(input)) {
    return err;
  }

  const fromAddress = makeEmailAddress(si`${input}@${domainName}`);

  if (isErr(fromAddress)) {
    return err;
  }

  return fromAddress;
}

export interface FeedId {
  kind: 'FeedId';
  value: string;
}

export function isFeedId(value: unknown): value is FeedId {
  return hasKind(value, 'FeedId');
}

export function makeFeedId(input: any): Result<FeedId> {
  if (!isString(input)) {
    return makeErr('Is not a string');
  }

  const value = input.trim();

  if (value.length === 0) {
    return makeErr('Is empty');
  }

  if (value.length < 3) {
    return makeErr('Is too short');
  }

  return {
    kind: 'FeedId',
    value: value,
  };
}

export function isFeed(value: unknown): value is Feed {
  return hasKind(value, 'Feed');
}
