import { getFeedInboxStorageKey, RSS_ITEM_FILE_PREFIX } from '../rss-checking/new-item-recording';
import { sortBy } from '../../shared/array-utils';
import { hasKind, isErr, makeErr, Result } from '../../shared/lang';
import { RssItem } from '../../domain/rss-item';
import { makeUrl } from '../../shared/url';
import { AppStorage } from '../../storage/storage';
import { FeedId } from '../../domain/feed-id';
import { si } from '../../shared/string-utils';
import { makePath } from '../../shared/path-utils';
import { AccountId } from '../../domain/account';

export interface RssReadingResult {
  kind: 'RssReadingResult';
  validItems: ValidStoredRssItem[];
  invalidItems: InvalidStoredRssItem[];
}

export interface ValidStoredRssItem {
  kind: 'ValidStoredRssItem';
  item: RssItem;
  fileName: string;
}

function isValidStoredRssItem(value: unknown): value is ValidStoredRssItem {
  return hasKind(value, 'ValidStoredRssItem');
}

interface InvalidStoredRssItem {
  kind: 'InvalidStoredRssItem';
  reason: string;
  json: unknown;
}

function isInvalidStoredRssItem(value: unknown): value is InvalidStoredRssItem {
  return hasKind(value, 'InvalidStoredRssItem');
}

export function readStoredRssItems(
  accountId: AccountId,
  feedId: FeedId,
  storage: AppStorage
): Result<RssReadingResult> {
  const storageKey = getFeedInboxStorageKey(accountId, feedId);
  const fileNamesResult = storage.listItems(storageKey);

  if (isErr(fileNamesResult)) {
    return makeErr(si`Failed to list files in ${storageKey}: ${fileNamesResult.reason}`);
  }

  const fileNameFormat = new RegExp(si`^${RSS_ITEM_FILE_PREFIX}.+\.json$`, 'i');
  const rssItems = fileNamesResult
    .filter((fileName) => fileNameFormat.test(fileName))
    // ASSUMPTION: storage.loadItem() never fails here
    .map((fileName) => [fileName, storage.loadItem(makePath(storageKey, fileName))])
    .map(([fileName, data]) => makeStoredRssItem(fileName, data));

  const validItems = rssItems.filter(isValidStoredRssItem).sort(sortBy(({ item }) => item.pubDate));
  const invalidItems = rssItems.filter(isInvalidStoredRssItem);

  return {
    kind: 'RssReadingResult',
    validItems,
    invalidItems,
  };
}

export function makeStoredRssItem(fileName: string, json: unknown): ValidStoredRssItem | InvalidStoredRssItem {
  const invalid = (reason: string) => ({ kind: 'InvalidStoredRssItem' as const, reason, json });

  let { title, content, author, pubDate, link, guid } = json as any;

  if (!title || typeof title !== 'string') {
    return invalid('The "title" property is not a present string');
  }

  if (!content || typeof content !== 'string') {
    return invalid('The "content" property is not a present string');
  }

  if (!author || typeof author !== 'string') {
    return invalid('The "author" property is not a present string');
  }

  pubDate = new Date(pubDate);

  if (pubDate.toString() === 'Invalid Date') {
    return invalid('The "pubDate" property is not a valid JSON Date string');
  }

  link = makeUrl(link);

  if (isErr(link)) {
    return invalid('The "link" property is not a valid URL');
  }

  if (!guid || typeof guid !== 'string') {
    return invalid('The "guid" property is not a present string');
  }

  const item: RssItem = { title, content, author, pubDate, link, guid };

  return { kind: 'ValidStoredRssItem', item, fileName };
}

export function getStoredRssItemStorageKey(accountId: AccountId, feedId: FeedId, fileName: string): string {
  return makePath(getFeedInboxStorageKey(accountId, feedId), fileName);
}
