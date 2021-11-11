import path from 'path';
import { inboxDirName, RSS_ITEM_FILE_PREFIX } from '../rss-checking/new-item-recording';
import { sortBy } from '../shared/array-utils';
import { DataDir } from '../shared/data-dir';
import { listFiles, ListFilesFn, readFile, ReadFileFn } from '../shared/io';
import { getErrorMessage, isErr, makeErr, Result } from '../shared/lang';
import { RssItem } from '../shared/rss-item';
import { makeUrl } from '../shared/url';

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
  json: string;
}

function isInvalidStoredRssItem(value: any): value is InvalidStoredRssItem {
  return value.kind === 'InvalidStoredRssItem';
}

export function readStoredRssItems(
  dataDir: DataDir,
  readFileFn: ReadFileFn = readFile,
  listFilesFn: ListFilesFn = listFiles
): Result<RssReadingResult> {
  const inboxDirPath = path.join(dataDir.value, inboxDirName);
  let fileNames: string[] = [];

  try {
    fileNames = listFilesFn(inboxDirPath);
  } catch (error) {
    return makeErr(`Can’t list files in ${inboxDirPath}: ${getErrorMessage(error)}`);
  }

  const fileNameFormat = new RegExp(`^${RSS_ITEM_FILE_PREFIX}.+\.json$`, 'i');
  const rssItems = fileNames
    .filter((fileName) => fileNameFormat.test(fileName))
    .map((fileName) => [fileName, readFileFn(`${inboxDirPath}/${fileName}`)])
    .map(([fileName, fileConten]) => makeStoredRssItem(fileName, fileConten));

  const validItems = rssItems.filter(isValidStoredRssItem).sort(sortBy(({ item }) => item.pubDate));
  const invalidItems = rssItems.filter(isInvalidStoredRssItem);

  return {
    kind: 'RssReadingResult',
    validItems,
    invalidItems,
  };
}

export function makeStoredRssItem(fileName: string, json: string): ValidStoredRssItem | InvalidStoredRssItem {
  const invalid = (reason: string) => ({ kind: 'InvalidStoredRssItem' as const, reason, json });

  try {
    let { title, content, author, pubDate, link, guid } = JSON.parse(json);

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
  } catch (error) {
    return invalid('Could not parse JSON');
  }
}
