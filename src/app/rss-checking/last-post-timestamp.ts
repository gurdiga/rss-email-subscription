import { FeedId, getFeedStorageKey } from '../../domain/feed-blob';
import { RssItem } from '../../domain/rss-item';
import { isEmpty, sortBy, SortDirection } from '../../shared/array-utils';
import { isErr, makeErr, Result } from '../../shared/lang';
import { AppStorage } from '../../shared/storage';
import { si } from '../../shared/string-utils';
import { makePath } from '../../shared/path-utils';
import { AccountId } from '../../domain/account';

export function getLastPostMetadata(
  accountId: AccountId,
  feedId: FeedId,
  storage: AppStorage
): Result<LastPostMetadata | undefined> {
  const storageKey = getStorageKey(accountId, feedId);

  if (!storage.hasItem(storageKey)) {
    return;
  }

  const data = storage.loadItem(storageKey);
  const pubDate = new Date(data.pubDate);

  if (pubDate.toString() === 'Invalid Date') {
    return makeErr(si`Invalid timestamp in ${storageKey}`);
  }

  const defaultGuid = '';
  const guid = data.guid || defaultGuid;

  return {
    pubDate,
    guid,
  };
}

export interface LastPostMetadata {
  pubDate: Date;
  guid: string;
}

export function recordLastPostMetadata(
  accountId: AccountId,
  feedId: FeedId,
  storage: AppStorage,
  items: RssItem[]
): Result<LastPostMetadata | undefined> {
  if (isEmpty(items)) {
    return;
  }

  const lastItem = [...items].sort(sortBy((i) => i.pubDate, SortDirection.Desc))[0]!;
  const metadata: LastPostMetadata = {
    pubDate: lastItem.pubDate,
    guid: lastItem.guid,
  };

  const storageKey = getStorageKey(accountId, feedId);
  const storeItemResult = storage.storeItem(storageKey, metadata);

  if (isErr(storeItemResult)) {
    return makeErr(si`Cant record last post timestamp: ${storeItemResult.reason}`);
  }

  return metadata;
}

function getStorageKey(accountId: AccountId, feedId: FeedId) {
  return makePath(getFeedStorageKey(accountId, feedId), 'lastPostMetadata.json');
}
