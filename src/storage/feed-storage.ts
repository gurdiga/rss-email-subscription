import { Err, isErr, makeErr, Result, hasKind } from '../shared/lang';
import { AppStorage } from './storage';
import { si } from '../shared/string-utils';
import { makePath } from '../shared/path-utils';
import { AccountId, AccountNotFound, makeAccountId } from '../domain/account';
import { accountsStorageKey } from './account-storage';
import { makeAccountNotFound } from '../domain/account';
import { makeUnixCronPattern } from '../domain/cron-pattern-making';
import { Feed, makeFeedHashingSalt, isFeed, EditFeedRequest, FeedStatus } from '../domain/feed';
import { FeedId, makeFeedId, isFeedId } from '../domain/feed-id';
import { MakeFeedInput, makeFeed } from '../domain/feed-making';

export interface FeedStoredData {
  displayName: string;
  url: string;
  hashingSalt: string;
  cronPattern: string;
  replyTo: string;
  isDeleted?: boolean;
  status: FeedStatus;
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
  does: false | AccountId;
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
    const accountHasFeedResult = accountHasFeedFn(accountId, feedId, storage);

    if (isErr(accountHasFeedResult)) {
      result.errs.push(accountHasFeedResult);
    }

    if (accountHasFeedResult === true) {
      result.does = accountId;
      break;
    }
  }

  return result;
}

export function accountHasFeed(accountId: AccountId, feedId: FeedId, storage: AppStorage): Result<boolean> {
  const key = getFeedJsonStorageKey(accountId, feedId);

  return storage.hasItem(key);
}

export function markFeedAsDeleted(
  accountId: AccountId,
  feedId: FeedId,
  storage: AppStorage,
  loadFeedFn = loadFeed,
  storeFeedFn = storeFeed
): Result<FeedNotFound | void> {
  const feed = loadFeedFn(accountId, feedId, storage);

  if (isErr(feed)) {
    return makeErr(si`Failed to ${loadFeed.name}: ${feed.reason}`);
  }

  if (isFeedNotFound(feed)) {
    return feed;
  }

  feed.isDeleted = true;

  const result = storeFeedFn(accountId, feed, storage);

  if (isErr(result)) {
    return makeErr(si`Failed to ${storeFeed.name}: ${result.reason}`);
  }
}

export function storeFeed(accountId: AccountId, feed: Feed, storage: AppStorage): Result<void> {
  const storageKey = getFeedJsonStorageKey(accountId, feed.id);
  const data: FeedStoredData = {
    displayName: feed.displayName,
    url: feed.url.toString(),
    hashingSalt: feed.hashingSalt.value,
    cronPattern: feed.cronPattern.value,
    replyTo: feed.replyTo.value,
    status: feed.status,
    isDeleted: feed.isDeleted,
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

  const loadedData = storage.loadItem(storageKey) as Err | FeedStoredData;

  if (isErr(loadedData)) {
    return makeErr(si`Failed to loadItem: ${loadedData.reason}`);
  }

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
    id: feedId.value,
    replyTo: loadedData.replyTo,
    isDeleted: !!loadedData.isDeleted,
    status: loadedData.status,
  };

  return makeFeed(makeFeedInput, hashingSalt, cronPattern);
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

  result.validFeeds = feeds.filter(isFeed).filter((x) => !x.isDeleted);
  result.errs = feeds.filter(isErr);
  result.feedIdErrs = feedIdResults.filter(isErr);
  result.feedNotFoundIds = feeds.filter(isFeedNotFound).map((x) => x.feedId.value);

  return result;
}

export function findFeedAccountId(feedId: FeedId, storage: AppStorage): Result<AccountId | AccountNotFound> {
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

export function applyEditFeedRequest(
  editFeedRequest: EditFeedRequest,
  accountId: AccountId,
  storage: AppStorage,
  loadFeedFn = loadFeed
): Result<void> {
  const feed = loadFeedFn(accountId, editFeedRequest.initialId, storage);

  if (isErr(feed)) {
    return makeErr(si`Failed to ${loadFeed.name}: ${feed.reason}`);
  }

  if (isFeedNotFound(feed)) {
    return makeErr(si`Feed not found for update: ${editFeedRequest.initialId.value}, accountId: ${accountId.value}`);
  }

  feed.displayName = editFeedRequest.displayName;
  feed.url = editFeedRequest.url;
  feed.replyTo = editFeedRequest.replyTo;

  const storeFeedResult = storeFeed(accountId, feed, storage);

  if (isErr(storeFeedResult)) {
    return storeFeedResult;
  }

  const oldStorageKey = getFeedStorageKey(accountId, editFeedRequest.initialId);
  const newStorageKey = getFeedStorageKey(accountId, editFeedRequest.id);

  if (oldStorageKey === newStorageKey) {
    return;
  }

  const renameResult = storage.renameItem(oldStorageKey, newStorageKey);

  if (isErr(renameResult)) {
    return makeErr(si`Failed to rename item: ${renameResult.reason}`);
  }

  return renameResult;
}
