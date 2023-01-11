import { EmailAddress, makeEmailAddress } from '../app/email-sending/emails';
import { Err, getTypeName, isErr, isObject, isString, makeErr, Result } from '../shared/lang';
import { hasKind } from '../shared/lang';
import { AppStorage } from '../shared/storage';
import { si } from '../shared/string-utils';
import { makePath } from '../shared/path-utils';
import { makeUrl } from '../shared/url';
import { AccountId, AccountNotFound, accountsStorageKey, makeAccountId } from './account';
import { makeAccountNotFound } from './account';
import { makeUnixCronPattern, UnixCronPattern } from './cron-pattern';

export interface Feed {
  kind: 'Feed';
  id: FeedId;
  displayName: string;
  url: URL;
  hashingSalt: FeedHashingSalt;
  replyTo: EmailAddress;
  cronPattern: UnixCronPattern;
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
  return <FeedNotFound>{ kind: 'FeedNotFound', feedId };
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

export interface FeedExistsResult {
  does: boolean;
  errs: Err[];
}

export function feedExists(
  feedId: FeedId,
  accountIds: AccountId[],
  storage: AppStorage,
  accountHasFeedFn = accountHasFeed
): Result<FeedExistsResult> {
  const result: FeedExistsResult = {
    does: false,
    errs: [],
  };

  for (const accountId of accountIds) {
    const accountHasFeedResult = accountHasFeedFn(accountId, feedId, storage); // TODO: Handle th Err

    if (isErr(accountHasFeedResult)) {
      result.errs.push(accountHasFeedResult);
    }

    if (accountHasFeedResult === true) {
      result.does = true;
      break;
    }
  }

  return result;
}

export function accountHasFeed(accountId: AccountId, feedId: FeedId, storage: AppStorage): Result<boolean> {
  const key = getFeedJsonStorageKey(accountId, feedId);

  return storage.hasItem(key);
}

export function alterExistingFeed(
  accountId: AccountId,
  existingFeed: Feed,
  newFeed: Feed,
  storage: AppStorage
): Result<void> {
  existingFeed.displayName = newFeed.displayName;
  existingFeed.cronPattern = newFeed.cronPattern;
  existingFeed.replyTo = newFeed.replyTo;
  existingFeed.url = newFeed.url;

  return storeFeed(accountId, existingFeed, storage);
}

export function storeFeed(accountId: AccountId, feed: Feed, storage: AppStorage): Result<void> {
  const storageKey = getFeedJsonStorageKey(accountId, feed.id);
  const data: FeedStoredData = {
    displayName: feed.displayName,
    url: feed.url.toString(),
    hashingSalt: feed.hashingSalt.value,
    cronPattern: feed.cronPattern.value,
    replyTo: feed.replyTo.value,
  };

  const result = storage.storeItem(storageKey, data);

  if (isErr(result)) {
    return makeErr(si`Failed to store feed data: ${result.reason}`);
  }
}

export function loadFeed(accountId: AccountId, feedId: FeedId, storage: AppStorage): Result<Feed | FeedNotFound> {
  const storageKey = getFeedJsonStorageKey(accountId, feedId);

  if (!storage.hasItem(storageKey)) {
    return makeFeedNotFound(feedId);
  }

  const loadedData = storage.loadItem(storageKey) as FeedStoredData;
  const hashingSalt = makeFeedHashingSalt(loadedData.hashingSalt);

  if (isErr(hashingSalt)) {
    return makeErr(si`Invalid feed hashingSalt: "${loadedData.hashingSalt}"`, 'hashingSalt');
  }

  const cronPattern = makeUnixCronPattern(loadedData.cronPattern);

  if (isErr(cronPattern)) {
    return makeErr(si`Invalid feed cronPattern: "${loadedData.cronPattern}"`, 'cronPattern');
  }

  const makeFeedInput: MakeFeedInput = {
    displayName: loadedData.displayName || feedId.value,
    url: loadedData.url,
    feedId: feedId.value,
    replyTo: loadedData.replyTo,
    cronPattern: cronPattern.value,
  };

  return makeFeed(makeFeedInput, hashingSalt);
}

export interface FeedsByAccountId {
  validFeeds: Feed[];
  feedNotFoundIds: string[];
  errs: Err[];
  feedIdErrs: Err[];
}

export function loadFeedsByAccountId(
  accountId: AccountId,
  storage: AppStorage,
  loadFeedFn = loadFeed
): Result<FeedsByAccountId> {
  const result: FeedsByAccountId = {
    validFeeds: [],
    errs: [],
    feedIdErrs: [],
    feedNotFoundIds: [],
  };

  const feedRootStorageKey = getFeedRootStorageKey(accountId);
  const hasAnyFeeds = storage.hasItem(getFeedRootStorageKey(accountId));

  if (isErr(hasAnyFeeds)) {
    return makeErr(si`Failed to check for feeds: ${hasAnyFeeds.reason}`);
  }

  if (hasAnyFeeds === false) {
    return result;
  }

  const feedIdStrings = storage.listSubdirectories(feedRootStorageKey);

  if (isErr(feedIdStrings)) {
    return makeErr(si`Failed to list feeds: ${feedIdStrings.reason}`);
  }

  const feedIdResults = feedIdStrings.map((x) => makeFeedId(x));
  const feedIds = feedIdResults.filter(isFeedId);
  const feeds = feedIds.map((feedId) => loadFeedFn(accountId, feedId, storage));

  result.validFeeds = feeds.filter(isFeed);
  result.errs = feeds.filter(isErr);
  result.feedIdErrs = feedIdResults.filter(isErr);
  result.feedNotFoundIds = feeds.filter(isFeedNotFound).map((x) => x.feedId.value);

  return result;
}

export interface MakeFeedInput {
  displayName?: string;
  url?: string;
  feedId?: string;
  replyTo?: string;
  cronPattern?: string;
}

export function makeFeed(input: MakeFeedInput, hashingSalt: FeedHashingSalt): Result<Feed> {
  if (!isObject(input)) {
    return makeErr('Invalid input');
  }

  const displayName = makeFeedDisplayName(input.displayName);

  if (isErr(displayName)) {
    return displayName;
  }

  const id = makeFeedId(input.feedId);

  if (isErr(id)) {
    return makeErr(si`Invalid feed ID: "${String(input.feedId)}"`, 'id');
  }

  if (!isString(input.url)) {
    return makeErr(si`Non-string feed URL: "${input.url!}"`, 'url');
  }

  const url = makeUrl(input.url);

  if (isErr(url)) {
    return makeErr(si`Invalid feed URL: "${input.url}"`, 'url');
  }

  const replyTo = makeEmailAddress(input.replyTo);

  if (isErr(replyTo)) {
    return makeErr(si`Invalid Reply To email: "${input.replyTo!}"`, 'replyTo');
  }

  const cronPattern = makeUnixCronPattern(input.cronPattern);

  if (isErr(cronPattern)) {
    return makeErr(si`Invalid cronPattern: "${input.cronPattern!}"`, 'cronPattern');
  }

  return <Feed>{
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
    return makeErr(si`Invalid feed display name: "${String(input)}"`, 'displayName');
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

  return <FeedId>{
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

export interface FeedHashingSalt {
  kind: 'FeedHashingSalt';
  value: string;
}

const feedHashingSaltLength = 16;

export function makeFeedHashingSalt(input: unknown): Result<FeedHashingSalt> {
  if (!isString(input)) {
    return makeErr(si`Must be a string: ${getTypeName(input)} ${JSON.stringify(input)}`);
  }

  if (input.length !== feedHashingSaltLength) {
    return makeErr(si`Must have the length of ${feedHashingSaltLength}`);
  }

  return <FeedHashingSalt>{
    kind: 'FeedHashingSalt',
    value: input,
  };
}

export function isFeedHashingSalt(value: unknown): value is FeedHashingSalt {
  return hasKind(value, 'FeedHashingSalt');
}
