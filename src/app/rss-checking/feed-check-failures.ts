import { AccountId } from '../../domain/account';
import { FeedId } from '../../domain/feed-id';
import { getFeedRootStorageKey } from '../../domain/feed-storage';
import { AppStorage } from '../../domain/storage';
import { isErr, makeErr, Result } from '../../shared/lang';
import { makePath } from '../../shared/path-utils';
import { si } from '../../shared/string-utils';

export interface FeedCheckFailureState {
  count: number;
  alerted: boolean;
}

export function recordFeedCheckFailure(
  accountId: AccountId,
  feedId: FeedId,
  storage: AppStorage
): Result<FeedCheckFailureState> {
  const previousState = loadState(accountId, feedId, storage);

  if (isErr(previousState)) {
    return previousState;
  }

  const newState: FeedCheckFailureState = { count: previousState.count + 1, alerted: previousState.alerted };
  const storeItemResult = storage.storeItem(getStorageKey(accountId, feedId), newState);

  if (isErr(storeItemResult)) {
    return makeErr(si`Failed to record feed check failure: ${storeItemResult.reason}`);
  }

  return newState;
}

export function markFeedCheckFailureAlerted(accountId: AccountId, feedId: FeedId, storage: AppStorage): Result<void> {
  const previousState = loadState(accountId, feedId, storage);

  if (isErr(previousState)) {
    return previousState;
  }

  const newState: FeedCheckFailureState = { ...previousState, alerted: true };
  const storeItemResult = storage.storeItem(getStorageKey(accountId, feedId), newState);

  if (isErr(storeItemResult)) {
    return makeErr(si`Failed to record feed check alert: ${storeItemResult.reason}`);
  }
}

export function resetFeedCheckFailures(accountId: AccountId, feedId: FeedId, storage: AppStorage): Result<void> {
  const storageKey = getStorageKey(accountId, feedId);

  return storage.removeItem(storageKey);
}

function loadState(accountId: AccountId, feedId: FeedId, storage: AppStorage): Result<FeedCheckFailureState> {
  const storageKey = getStorageKey(accountId, feedId);
  const hasItemResult = storage.hasItem(storageKey);

  if (isErr(hasItemResult)) {
    return makeErr(si`Failed to check for ${storageKey}: ${hasItemResult.reason}`);
  }

  if (!hasItemResult) {
    return { count: 0, alerted: false };
  }

  const loadItemResult = storage.loadItem(storageKey);

  if (isErr(loadItemResult)) {
    return makeErr(si`Failed to load ${storageKey}: ${loadItemResult.reason}`);
  }

  return { count: loadItemResult.count, alerted: loadItemResult.alerted ?? false };
}

function getStorageKey(accountId: AccountId, feedId: FeedId) {
  return makePath(getFeedRootStorageKey(accountId, feedId), 'feedCheckFailureCount.json');
}
