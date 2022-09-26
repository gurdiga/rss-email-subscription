import { inboxDirName, RSS_ITEM_FILE_PREFIX } from '../rss-checking/new-item-recording';
import { sortBy } from '../../shared/array-utils';
import { isErr, makeErr, Result } from '../../shared/lang';
import { RssItem } from '../../domain/rss-item';
import { makeUrl } from '../../shared/url';
import { AppStorage } from '../../shared/storage';

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

function isValidStoredRssItem(value: any): value is ValidStoredRssItem {
  return value.kind === 'ValidStoredRssItem';
}

interface InvalidStoredRssItem {
  kind: 'InvalidStoredRssItem';
  reason: string;
  json: any;
}

function isInvalidStoredRssItem(value: any): value is InvalidStoredRssItem {
  return value.kind === 'InvalidStoredRssItem';
}

export function readStoredRssItems(feedId: string, storage: AppStorage): Result<RssReadingResult> {
  const storageKey = `/${feedId}/${inboxDirName}`;
  const fileNamesResult = storage.listItems(storageKey);

  if (isErr(fileNamesResult)) {
    return makeErr(`Can’t list files in ${storageKey}: ${fileNamesResult.reason}`);
  }

  const fileNameFormat = new RegExp(`^${RSS_ITEM_FILE_PREFIX}.+\.json$`, 'i');
  const rssItems = fileNamesResult
    .filter((fileName) => fileNameFormat.test(fileName))
    // ASSUMPTION: storage.loadItem() never fails here
    .map((fileName) => [fileName, storage.loadItem(`/${feedId}/${inboxDirName}/${fileName}`)])
    .map(([fileName, data]) => makeStoredRssItem(fileName, data));

  const validItems = rssItems.filter(isValidStoredRssItem).sort(sortBy(({ item }) => item.pubDate));
  const invalidItems = rssItems.filter(isInvalidStoredRssItem);

  return {
    kind: 'RssReadingResult',
    validItems,
    invalidItems,
  };
}

export function makeStoredRssItem(fileName: string, json: any): ValidStoredRssItem | InvalidStoredRssItem {
  const invalid = (reason: string) => ({ kind: 'InvalidStoredRssItem' as const, reason, json });

  let { title, content, author, pubDate, link, guid } = json;

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
