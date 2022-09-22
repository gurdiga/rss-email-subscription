import { HashFn, hash } from '../../shared/crypto';
import { isErr, makeErr, Result } from '../../shared/lang';
import { RssItem } from '../../shared/rss-item';
import { AppStorage } from '../../shared/storage';

export type NameFileFn = (item: RssItem) => string;

export const inboxDirName = 'inbox';

export function recordNewRssItems(
  feedId: string,
  storage: AppStorage,
  rssItems: RssItem[],
  nameFileFn: NameFileFn = itemFileName
): Result<number> {
  let writtenItemCount = 0;

  for (const item of rssItems) {
    const fileName = nameFileFn(item);
    const storageKey = `/${feedId}/${inboxDirName}/${fileName}`;

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
