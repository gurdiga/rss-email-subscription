import Parser, { Item } from 'rss-parser';
import { isErr, makeErr, Result } from '../shared/lang';
import { RssItem } from '../shared/rss-item';
import { makeUrl } from '../shared/url';
import { RssResponse } from './rss-response';

export interface RssParsingResult {
  kind: 'RssParseResult';
  validItems: RssItem[];
  invalidItems: InvalidRssItem[];
}

export async function parseRssItems(
  rssResponse: RssResponse,
  buildRssItemFn: BuildRssItemFn = buildRssItem
): Promise<Result<RssParsingResult>> {
  const parser = new Parser();

  try {
    const feed = await parser.parseString(rssResponse.xml);

    try {
      const items = feed.items.map((item) => buildRssItemFn(item as ParsedRssItem, rssResponse.baseURL));

      const validItems = items.filter(isValidRssItem).map((i) => i.value);
      const invalidItems = items.filter(isInvalidRssItem);

      return {
        kind: 'RssParseResult',
        validItems,
        invalidItems,
      };
    } catch (error) {
      return makeErr(`buildRssItemFn threw: ${error}`);
    }
  } catch (error) {
    return makeErr(`Invalid XML: ${rssResponse.xml}`);
  }
}

interface InvalidRssItem {
  kind: 'InvalidRssItem';
  reason: string;
  item: ParsedRssItem;
}

export interface ParsedRssItem extends Item {
  author?: string; // The Item interface of rss-parser is missing author?!
  creator?: string; // This is non-standard, but present in WP feeds
}

export interface ValidRssItem {
  kind: 'ValidRssItem';
  value: RssItem;
}

function isValidRssItem(value: any): value is ValidRssItem {
  return value.kind === 'ValidRssItem';
}

export type BuildRssItemFn = (item: ParsedRssItem, baseURL: URL) => ValidRssItem | InvalidRssItem;

export function buildRssItem(item: ParsedRssItem, baseURL: URL): ValidRssItem | InvalidRssItem {
  const { title, content, isoDate } = item;
  const author = item.author || item.creator;
  const isMissing = (value: string | undefined): value is undefined => !value?.trim();
  const invalidRssItem = (reason: string) => ({ kind: 'InvalidRssItem' as const, reason, item });

  if (isMissing(title)) {
    return invalidRssItem('Post title is missing');
  }

  if (isMissing(content)) {
    return invalidRssItem('Post content is missing');
  }

  if (isMissing(author)) {
    return invalidRssItem('Post author is missing');
  }

  if (isMissing(isoDate)) {
    return invalidRssItem('Post publication timestamp is missing');
  }

  const linkString = item.link?.trim();

  if (!linkString) {
    return invalidRssItem('Post link is missing');
  }

  const link = makeUrl(linkString, baseURL);

  if (isErr(link)) {
    return invalidRssItem('Post link is not a valid URL');
  }

  const pubDate = new Date(isoDate?.trim());

  if (pubDate.toString() === 'Invalid Date') {
    return invalidRssItem('Post publication timestamp is not a valid JSON date string');
  }

  const value: RssItem = { title, content, author, pubDate, link };

  return {
    kind: 'ValidRssItem',
    value,
  };
}

function isInvalidRssItem(value: any): value is InvalidRssItem {
  return value.kind === 'InvalidRssItem';
}
