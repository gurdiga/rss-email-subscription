import { HashFn, hash } from '../../shared/crypto';
import { isErr, makeErr, Result } from '../../shared/lang';
import { RssItem } from '../../domain/rss-item';
import { AppStorage } from '../../shared/storage';
import { FeedId, getFeedStorageKey } from '../../domain/feed';
import { getStoredRssItemStorageKey } from '../email-sending/rss-item-reading';
import { si } from '../../shared/string-utils';
import { makePath } from '../../shared/path-utils';

export function recordNewRssItems(
  feedId: FeedId,
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
      return makeErr(si`Cant write RSS item file to inbox: ${storeItemResult.reason}, item: ${JSON.stringify(item)}`);
    }

    writtenItemCount++;
  }

  return writtenItemCount;
}

export const RSS_ITEM_FILE_PREFIX = 'rss-item-';

export function itemFileName(item: RssItem, hashFn: HashFn = hash): string {
  const hashingSalt = 'item-name-salt';
  const input = si`${item.title}${item.content}${item.pubDate.toJSON()}`;
  const hash = hashFn(input, hashingSalt);

  return si`${RSS_ITEM_FILE_PREFIX}${hash}.json`;
}

export function getFeedInboxStorageKey(feedId: FeedId): string {
  return makePath(getFeedStorageKey(feedId), 'inbox');
}
