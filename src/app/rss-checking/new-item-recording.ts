import { HashFn, hash } from '../../shared/crypto';
import { isErr, makeErr, Result } from '../../shared/lang';
import { RssItem } from '../../domain/rss-item';
import { AppStorage } from '../../shared/storage';
import { getFeedStorageKey } from '../../domain/feed';
import { getStoredRssItemStorageKey } from '../email-sending/rss-item-reading';

export function recordNewRssItems(
  feedId: string,
  storage: AppStorage,
  rssItems: RssItem[],
  nameFileFn = itemFileName
): Result<number> {
  let writtenItemCount = 0;

  for (const item of rssItems) {
    const fileName = nameFileFn(item);
    const storageKey = getStoredRssItemStorageKey(feedId, fileName);

    const storeItemResult = storage.storeItem(storageKey, item);

    if (isErr(storeItemResult)) {
      return makeErr(`Cant write RSS item file to inbox: ${storeItemResult.reason}, item: ${JSON.stringify(item)}`);
    }

    writtenItemCount++;
  }

  return writtenItemCount;
}

export const RSS_ITEM_FILE_PREFIX = 'rss-item-';

export function itemFileName(item: RssItem, hashFn: HashFn = hash): string {
  const hashingSalt = 'item-name-salt';
  const hash = hashFn(item.title + item.content + item.pubDate.toJSON(), hashingSalt);

  return `${RSS_ITEM_FILE_PREFIX}${hash}.json`;
}

export function getFeedInboxStorageKey(feedId: string): string {
  return `${getFeedStorageKey(feedId)}/inbox`;
}
