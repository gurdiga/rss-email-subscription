import { Err, Result, hasKind, isErr, isObject, makeErr, makeTypeMismatchErr } from '../shared/lang';
import { makePath } from '../shared/path-utils';
import { si } from '../shared/string-utils';
import { AccountId, AccountNotFound, makeAccountId, makeAccountNotFound } from './account';
import { accountsStorageKey } from './account-storage';
import { EditFeedRequest, Feed, FeedStatus, makeFeedEmailBodySpecString } from './feed';
import { FeedId, makeFeedId } from './feed-id';
import { makeFeed } from './feed-making';
import { AppStorage } from './storage';

export interface FeedStoredData {
  displayName: string;
  url: string;
  hashingSalt: string;
  cronPattern: string;
  replyTo: string;
  status: FeedStatus;
  emailBodySpec: string;
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

export function getFeedsRootStorageKey(accountId: AccountId) {
  return makePath(accountsStorageKey, accountId.value, 'feeds');
}

export function getFeedRootStorageKey(accountId: AccountId, feedId: FeedId) {
  return makePath(getFeedsRootStorageKey(accountId), feedId.value);
}

export function getFeedJsonStorageKey(accountId: AccountId, feedId: FeedId) {
  return makePath(getFeedRootStorageKey(accountId, feedId), 'feed.json');
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

export function deleteFeed(accountId: AccountId, feedId: FeedId, storage: AppStorage): Result<void> {
  const storageKey = getFeedRootStorageKey(accountId, feedId);

  return storage.removeTree(storageKey);
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
    emailBodySpec: makeFeedEmailBodySpecString(feed.emailBodySpec),
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

  const data = storage.loadItem(storageKey) as unknown;

  if (isErr(data)) {
    return makeErr(si`Failed to loadItem: ${data.reason}`);
  }

  if (!isObject(data)) {
    return makeTypeMismatchErr(data, 'object');
  }

  return makeFeed({ ...data, id: feedId.value });
}

export interface FeedsByAccountId {
  validFeeds: Feed[];
  feedNotFoundIds: string[];
  errs: [FeedId, Err][];
  feedIdErrs: Err[];
}

export function loadFeedsByAccountId(
  accountId: AccountId,
  storage: AppStorage,
  loadFeedFn = loadFeed
): Result<FeedsByAccountId> {
  const results: FeedsByAccountId = {
    validFeeds: [],
    errs: [],
    feedIdErrs: [],
    feedNotFoundIds: [],
  };

  const feedRootStorageKey = getFeedsRootStorageKey(accountId);
  const hasAnyFeeds = storage.hasItem(getFeedsRootStorageKey(accountId));

  if (isErr(hasAnyFeeds)) {
    return makeErr(si`Failed to check for feeds: ${hasAnyFeeds.reason}`);
  }

  if (hasAnyFeeds === false) {
    return results;
  }

  const feedIdStrings = storage.listSubdirectories(feedRootStorageKey);

  if (isErr(feedIdStrings)) {
    return makeErr(si`Failed to list feeds: ${feedIdStrings.reason}`);
  }

  for (const feedIdString of feedIdStrings) {
    const feedId = makeFeedId(feedIdString);

    if (isErr(feedId)) {
      results.feedIdErrs.push(feedId);
      continue;
    }

    const result = loadFeedFn(accountId, feedId, storage);

    if (isErr(result)) {
      results.errs.push([feedId, result]);
    } else if (isFeedNotFound(result)) {
      results.feedNotFoundIds.push(feedId.value);
    } else {
      results.validFeeds.push(result);
    }
  }

  return results;
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
  // TODO: Assert editFeedRequest.id is NOT taken
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
  feed.emailBodySpec = editFeedRequest.emailBodySpec;

  const storeFeedResult = storeFeed(accountId, feed, storage);

  if (isErr(storeFeedResult)) {
    return storeFeedResult;
  }

  const oldStorageKey = getFeedRootStorageKey(accountId, editFeedRequest.initialId);
  const newStorageKey = getFeedRootStorageKey(accountId, editFeedRequest.id);

  if (oldStorageKey === newStorageKey) {
    return;
  }

  const renameResult = storage.renameItem(oldStorageKey, newStorageKey);

  if (isErr(renameResult)) {
    return makeErr(si`Failed to rename item: ${renameResult.reason}`);
  }

  return renameResult;
}
