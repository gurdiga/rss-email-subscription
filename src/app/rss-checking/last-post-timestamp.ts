import { FeedId, getFeedStorageKey } from '../../domain/feed';
import { RssItem } from '../../domain/rss-item';
import { isEmpty, sortBy, SortDirection } from '../../shared/array-utils';
import { isErr, makeErr, Result } from '../../shared/lang';
import { AppStorage } from '../../shared/storage';

export function getLastPostMetadata(feedId: FeedId, storage: AppStorage): Result<LastPostMetadata | undefined> {
  const storageKey = getStorageKey(feedId);

  if (!storage.hasItem(storageKey)) {
    return;
  }

  const data = storage.loadItem(storageKey);
  const pubDate = new Date(data.pubDate);

  if (pubDate.toString() === 'Invalid Date') {
    return makeErr(`Invalid timestamp in ${storageKey}`);
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

  const storageKey = getStorageKey(feedId);
  const storeItemResult = storage.storeItem(storageKey, metadata);

  if (isErr(storeItemResult)) {
    return makeErr(`Cant record last post timestamp: ${storeItemResult.reason}`);
  }

  return metadata;
}

function getStorageKey(feedId: FeedId) {
  return `${getFeedStorageKey(feedId)}/lastPostMetadata.json`;
}
