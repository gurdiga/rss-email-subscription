import { isErr, makeErr, Result } from '../../shared/lang';
import { getStoredRssItemStorageKey, ValidStoredRssItem } from './rss-item-reading';
import { AppStorage } from '../../shared/storage';
import { FeedId } from '../../domain/feed-blob';
import { si } from '../../shared/string-utils';
import { AccountId } from '../../domain/account';

export function deleteItem(
  accountId: AccountId,
  feedId: FeedId,
  storage: AppStorage,
  storedRssItem: ValidStoredRssItem
): Result<void> {
  const storageKey = getStoredRssItemStorageKey(accountId, feedId, storedRssItem.fileName);
  const removeItemResult = storage.removeItem(storageKey);

  if (isErr(removeItemResult)) {
    return makeErr(si`Failed to delete stored RSS item: ${removeItemResult.reason}`);
  }
}
