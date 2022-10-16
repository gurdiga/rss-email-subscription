import { inboxDirName } from '../rss-checking/new-item-recording';
import { isErr, makeErr, Result } from '../../shared/lang';
import { ValidStoredRssItem } from './rss-item-reading';
import { AppStorage } from '../../shared/storage';
import { getFeedStorageKey } from '../../domain/feed-settings';

export function deleteItem(feedId: string, storage: AppStorage, storedRssItem: ValidStoredRssItem): Result<void> {
  const storageKey = `${getFeedStorageKey(feedId)}/${inboxDirName}/${storedRssItem.fileName}`;
  const removeItemResult = storage.removeItem(storageKey);

  if (isErr(removeItemResult)) {
    return makeErr(`Can’t delete stored RSS item: ${removeItemResult.reason}`);
  }
}
