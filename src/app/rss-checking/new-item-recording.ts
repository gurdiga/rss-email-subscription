import { AccountId } from '../../domain/account';
import { FeedId } from '../../domain/feed-id';
import { getFeedRootStorageKey } from '../../domain/feed-storage';
import { RssItem } from '../../domain/rss-item';
import { AppStorage } from '../../domain/storage';
import { rssItemHash } from '../../shared/crypto';
import { Result, isErr, makeErr } from '../../shared/lang';
import { makePath } from '../../shared/path-utils';
import { si } from '../../shared/string-utils';
import { getStoredRssItemStorageKey } from '../email-sending/rss-item-reading';

export function recordNewRssItems(
  accountId: AccountId,
  feedId: FeedId,
  storage: AppStorage,
  rssItems: RssItem[],
  itemFileNameFn = getItemFileName
): Result<number> {
  let writtenItemCount = 0;

  for (const item of rssItems) {
    const fileName = itemFileNameFn(item);
    const storageKey = getStoredRssItemStorageKey(accountId, feedId, fileName);

    const storeItemResult = storage.storeItem(storageKey, item);

    if (isErr(storeItemResult)) {
      return makeErr(si`Cant write RSS item file to inbox: ${storeItemResult.reason}, item: ${JSON.stringify(item)}`);
    }

    writtenItemCount++;
  }

  return writtenItemCount;
}

export function getRssItemId(item: RssItem): string {
  const input = si`${item.title}${item.content}${item.pubDate.toJSON()}`;
  const hash = rssItemHash(input);
  const isoDate = item.pubDate.toISOString().substring(0, 10).replaceAll('-', ''); // 'YYYYMMDD'

  return si`${isoDate}-${hash}`;
}

export function getItemFileName(item: RssItem): string {
  const itemId = getRssItemId(item);

  return si`${itemId}.json`;
}

export function getFeedInboxStorageKey(accountId: AccountId, feedId: FeedId): string {
  return makePath(getFeedRootStorageKey(accountId, feedId), 'inbox');
}

export function getFeedOutboxStorageKey(accountId: AccountId, feedId: FeedId): string {
  return makePath(getFeedRootStorageKey(accountId, feedId), 'outbox');
}
