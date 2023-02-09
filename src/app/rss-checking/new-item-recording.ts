import { HashFn, hash } from '../../shared/crypto';
import { isErr, makeErr, Result } from '../../shared/lang';
import { RssItem } from '../../domain/rss-item';
import { AppStorage } from '../../storage/storage';
import { FeedId } from '../../domain/feed-id';
import { getFeedStorageKey } from '../../storage/feed-storage';
import { getStoredRssItemStorageKey } from '../email-sending/rss-item-reading';
import { si } from '../../shared/string-utils';
import { makePath } from '../../shared/path-utils';
import { AccountId } from '../../domain/account';

export function recordNewRssItems(
  accountId: AccountId,
  feedId: FeedId,
  storage: AppStorage,
  rssItems: RssItem[],
  nameFileFn = itemFileName
): Result<number> {
  let writtenItemCount = 0;

  for (const item of rssItems) {
    const fileName = nameFileFn(item);
    const storageKey = getStoredRssItemStorageKey(accountId, feedId, fileName);

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

export function getFeedInboxStorageKey(accountId: AccountId, feedId: FeedId): string {
  return makePath(getFeedStorageKey(accountId, feedId), 'inbox');
}
