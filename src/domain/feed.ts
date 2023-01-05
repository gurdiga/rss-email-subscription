import { EmailAddress, makeEmailAddress } from '../app/email-sending/emails';
import { getRandomString } from '../shared/crypto';
import { Err, isErr, isObject, isString, makeErr, Result } from '../shared/lang';
import { hasKind } from '../shared/lang';
import { AppStorage } from '../shared/storage';
import { si } from '../shared/string-utils';
import { makePath } from '../shared/path-utils';
import { makeUrl } from '../shared/url';
import { AccountId, AccountNotFound, accountsStorageKey, makeAccountId } from './account';
import { makeAccountNotFound } from './account';
import { cronPatternBySchedule } from './cron-pattern';

export interface Feed {
  kind: 'Feed';
  id: FeedId;
  displayName: string;
  url: URL;
  hashingSalt: string;
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

export function makeFeedNotFound(feedId: FeedId): FeedNotFound {
  return { kind: 'FeedNotFound', feedId };
}

export function isFeedNotFound(value: unknown): value is FeedNotFound {
  return hasKind(value, 'FeedNotFound');
}

export function getFeedRootStorageKey(accountId: AccountId) {
  return makePath(accountsStorageKey, accountId.value, 'feeds');
}

export function getFeedStorageKey(accountId: AccountId, feedId: FeedId) {
  return makePath(getFeedRootStorageKey(accountId), feedId.value);
}

export function getFeedJsonStorageKey(accountId: AccountId, feedId: FeedId) {
  return makePath(getFeedStorageKey(accountId, feedId), 'feed.json');
}

export function storeFeed(accountId: AccountId, feed: Feed, storage: AppStorage): Result<void> {
  const storageKey = getFeedJsonStorageKey(accountId, feed.id);
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

export function getFeed(
  accountId: AccountId,
  feedId: FeedId,
  storage: AppStorage,
  domainName: string
): Result<Feed | FeedNotFound> {
  const storageKey = getFeedJsonStorageKey(accountId, feedId);

  if (!storage.hasItem(storageKey)) {
    return makeFeedNotFound(feedId);
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
    return makeErr(
      si`Failed to ${makeEmailAddress.name} from feedId "${feedId.value}" and domain name "${domainName}"`
    );
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
    replyTo,
    cronPattern,
  };
}

export interface FeedsByAccountId {
  validFeeds: Feed[];
  feedNotFoundIds: string[];
  errs: string[];
  feedIdErrs: Err[];
}

export function loadFeedsByAccountId(
  accountId: AccountId,
  storage: AppStorage,
  domainName: string,
  getFeedFn = getFeed
): Result<FeedsByAccountId> {
  const feedIdStrings = storage.listSubdirectories(getFeedRootStorageKey(accountId));

  if (isErr(feedIdStrings)) {
    return makeErr(si`Failed to list feeds: ${feedIdStrings.reason}`);
  }

  const feedIdResults = feedIdStrings.map((x) => makeFeedId(x));
  const feedIds = feedIdResults.filter(isFeedId);
  const feedIdErrs = feedIdResults.filter(isErr);

  const feeds = feedIds.map((feedId) => getFeedFn(accountId, feedId, storage, domainName));
  const errs = feeds.filter(isErr).map((x) => x.reason);
  const feedNotFoundIds = feeds.filter(isFeedNotFound).map((x) => x.feedId.value);
  const validFeeds = feeds.filter(isFeed);

  return { validFeeds, errs, feedIdErrs, feedNotFoundIds };
}

export interface MakeFeedInput {
  displayName?: string;
  url?: string;
  feedId?: string;
  replyTo?: string;
  schedule?: string;
}

export function makeFeed(input: MakeFeedInput, getRandomStringFn = getRandomString): Result<Feed> {
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
    replyTo,
    cronPattern,
  };
}

function makeFeedDisplayName(input: unknown): Result<string> {
  if (!isString(input) || input.trim().length < 5 || input.trim().length > 50) {
    return makeErr('Invalid feed display name', 'displayName');
  }

  return input.trim();
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
    return makeErr('Is not a string', input);
  }

  const value = input.trim();

  if (value.length === 0) {
    return makeErr('Is empty', value);
  }

  if (value.length < 3) {
    return makeErr('Is too short', value);
  }

  return {
    kind: 'FeedId',
    value: value,
  };
}

export function isFeed(value: unknown): value is Feed {
  return hasKind(value, 'Feed');
}

export function findAccountId(feedId: FeedId, storage: AppStorage): Result<AccountId | AccountNotFound> {
  const accountIdStrings = storage.listSubdirectories(accountsStorageKey);

  if (isErr(accountIdStrings)) {
    return makeErr(si`Failed to list accounts: ${accountIdStrings.reason}`);
  }

  for (const accountIdString of accountIdStrings) {
    const accountId = makeAccountId(accountIdString);

    if (isErr(accountId)) {
      return makeErr(si`Invalid accountId directory: ${accountId.reason}`);
    }

    const feedStorageKey = getFeedJsonStorageKey(accountId, feedId);
    const isOwner = storage.hasItem(feedStorageKey);

    if (isErr(isOwner)) {
      return makeErr(si`Failed to check if exists: ${isOwner.reason}`);
    }

    if (isOwner) {
      return accountId;
    }
  }

  return makeAccountNotFound();
}
