import { AccountId } from '../../domain/account';
import { FeedId } from '../../domain/feed-id';
import { RssItem } from '../../domain/rss-item';
import { AppStorage } from '../../domain/storage';
import { sortBy } from '../../shared/array-utils';
import { makeDate } from '../../shared/date-utils';
import { hasKind, isErr, makeErr, makeNonEmptyString, makeValues, Result } from '../../shared/lang';
import { makePath } from '../../shared/path-utils';
import { si } from '../../shared/string-utils';
import { makeAbsoluteHttpUrl, makeHttpUrl } from '../../shared/url';
import { getFeedInboxStorageKey } from '../rss-checking/new-item-recording';

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

export function makeRssItem(data: unknown): Result<RssItem> {
  return makeValues<RssItem>(data, {
    title: makeNonEmptyString,
    content: makeNonEmptyString,
    author: makeNonEmptyString,
    pubDate: makeDate,
    link: makeAbsoluteHttpUrl,
    guid: makeNonEmptyString,
  });
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
  const result: RssReadingResult = {
    kind: 'RssReadingResult',
    validItems: [],
    invalidItems: [],
  };

  const storageKey = getFeedInboxStorageKey(accountId, feedId);
  const feedInboxExists = storage.hasItem(storageKey);

  if (isErr(feedInboxExists)) {
    return makeErr(si`Failed to check inbox exists: ${feedInboxExists.reason}`);
  }

  if (feedInboxExists === false) {
    return result;
  }

  const fileNamesResult = storage.listItems(storageKey);

  if (isErr(fileNamesResult)) {
    return makeErr(si`Failed to list files in ${storageKey}: ${fileNamesResult.reason}`);
  }

  const rssItems = fileNamesResult
    // ASSUMPTION: storage.loadItem() never errs here
    .map((fileName) => [fileName, storage.loadItem(makePath(storageKey, fileName))])
    .map(([fileName, data]) => makeStoredRssItem(fileName, data));

  result.validItems = rssItems.filter(isValidStoredRssItem).sort(sortBy(({ item }) => item.pubDate));
  result.invalidItems = rssItems.filter(isInvalidStoredRssItem);

  return result;
}

export function makeStoredRssItem(fileName: string, json: unknown): ValidStoredRssItem | InvalidStoredRssItem {
  const invalid = (reason: string) => ({
    kind: 'InvalidStoredRssItem' as const,
    reason: si`${reason} in ${fileName}`,
    json,
  });

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

  link = makeHttpUrl(link);

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
