import { isErr, makeErr, Result } from '../../shared/lang';
import { getStoredRssItemStorageKey, ValidStoredRssItem } from './rss-item-reading';
import { AppStorage } from '../../shared/storage';

export function deleteItem(feedId: string, storage: AppStorage, storedRssItem: ValidStoredRssItem): Result<void> {
  const storageKey = getStoredRssItemStorageKey(feedId, storedRssItem.fileName);
  const removeItemResult = storage.removeItem(storageKey);

  if (isErr(removeItemResult)) {
    return makeErr(`Failed to delete stored RSS item: ${removeItemResult.reason}`);
  }
}
