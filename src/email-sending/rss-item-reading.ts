import { DataDir } from '../shared/data-dir';
import { listFiles, ListFilesFn, readFile, ReadFileFn } from '../shared/io';
import { Result } from '../shared/lang';
import { isValidRssItem, RssItem, ValidRssItem } from '../shared/rss-item';

export interface RssReadingResult {
  kind: 'RssReadingResult';
  validItems: RssItem[];
  invalidItems: InvalidStoredRssItem[];
}

interface InvalidStoredRssItem {
  kind: 'InvalidStoredRssItem';
  reason: string;
  json: string;
}

function isInvalidStoredRssItem(value: any): value is InvalidStoredRssItem {
  return value.kind === 'InvalidStoredRssItem';
}

export async function getRssItems(
  dataDir: DataDir,
  readFileFn: ReadFileFn = readFile,
  listFilesFn: ListFilesFn = listFiles
): Promise<Result<RssReadingResult>> {
  const fileNameFormat = /^\d{10}-.+\.json$/;
  const fileNames = listFilesFn(`${dataDir.value}/inbox`).filter((fileName) => fileNameFormat.test(fileName));

  const rssItems = fileNames
    .map((fileName) => readFileFn(`${dataDir.value}/inbox/${fileName}`))
    .map((fileConten) => makeRssItemFromInboxFile(fileConten));

  const validItems = rssItems
    .filter(isValidRssItem)
    .map((v) => v.value)
    .sort((a, b) => (a.pubDate > b.pubDate ? 1 : -1));

  const invalidItems = rssItems.filter(isInvalidStoredRssItem);

  return {
    kind: 'RssReadingResult',
    validItems,
    invalidItems,
  };
}

export function makeRssItemFromInboxFile(json: string): ValidRssItem | InvalidStoredRssItem {
  const makeInvalidStoredRssItem = (reason: string) => ({ kind: 'InvalidStoredRssItem' as const, reason, json });
  try {
    let { title, content, author, pubDate, link } = JSON.parse(json);

    if (!title || typeof title !== 'string') {
      return makeInvalidStoredRssItem('The "title" property is not a present string');
    }

    if (!content || typeof content !== 'string') {
      return makeInvalidStoredRssItem('The "content" property is not a present string');
    }

    if (!author || typeof author !== 'string') {
      return makeInvalidStoredRssItem('The "author" property is not a present string');
    }

    pubDate = new Date(pubDate);

    if (pubDate.toString() === 'Invalid Date') {
      return makeInvalidStoredRssItem('The "pubDate" property is not a valid JSON Date string');
    }

    try {
      link = new URL(link);
    } catch (error) {
      return makeInvalidStoredRssItem('The "link" property is not a valid URL');
    }

    const value: RssItem = { title, content, author, pubDate, link };

    return {
      kind: 'ValidRssItem',
      value,
    };
  } catch (error) {
    return makeInvalidStoredRssItem('Could not parse JSON');
  }
}
