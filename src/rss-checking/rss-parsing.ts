import Parser, { Item } from 'rss-parser';
import { makeErr, Result } from '../shared/lang';
import { isValidRssItem, RssItem, ValidRssItem } from '../shared/rss-item';
import { RssResponse } from './rss-response';

export interface RssParseResult {
  kind: 'RssParseResult';
  validItems: RssItem[];
  invalidItems: InvalidRssItem[];
}

export async function parseRssItems(
  rssResponse: RssResponse,
  buildRssItemFn: BuildRssItemFn = buildRssItem
): Promise<Result<RssParseResult>> {
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
  author: string | undefined; // The Item interface of rss-parser is missing author?!
}

export type BuildRssItemFn = (item: ParsedRssItem, baseURL: URL) => ValidRssItem | InvalidRssItem;

export function buildRssItem(item: ParsedRssItem, baseURL: URL): ValidRssItem | InvalidRssItem {
  const isMissing = (value: string | undefined): value is undefined => !value?.trim();

  if (isMissing(item.title)) {
    return {
      kind: 'InvalidRssItem',
      reason: 'Post title is missing',
      item,
    };
  }

  if (isMissing(item.content)) {
    return {
      kind: 'InvalidRssItem',
      reason: 'Post content is missing',
      item,
    };
  }

  if (isMissing(item.author)) {
    return {
      kind: 'InvalidRssItem',
      reason: 'Post author is missing',
      item,
    };
  }

  if (isMissing(item.isoDate)) {
    return {
      kind: 'InvalidRssItem',
      reason: 'Post publication timestamp is missing',
      item,
    };
  }

  const linkString = item.link?.trim();

  if (!linkString) {
    return {
      kind: 'InvalidRssItem',
      reason: 'Post link is missing',
      item,
    };
  }

  const link = new URL(linkString, baseURL);
  const publicationTimestamp = new Date(item.isoDate?.trim());

  if (publicationTimestamp.toString() === 'Invalid Date') {
    return {
      kind: 'InvalidRssItem',
      reason: 'Post publication timestamp is an invalid JSON date string',
      item,
    };
  }

  const value: RssItem = {
    title: item.title,
    content: item.content,
    author: item.author,
    pubDate: new Date(item.isoDate),
    link: link,
  };

  return {
    kind: 'ValidRssItem',
    value,
  };
}

function isInvalidRssItem(value: any): value is InvalidRssItem {
  return value.kind === 'InvalidRssItem';
}
