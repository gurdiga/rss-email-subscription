import Parser, { Item } from 'rss-parser';
import { makeErr, Result } from '../shared/lang';
import { RssResponse } from './rss-response';

export interface RssItem {
  title: string;
  content: string;
  author: string;
  pubDate: Date;
  link: URL;
}

export interface RssParseResult {
  kind: 'RssParseResult';
  validItems: RssItem[];
  invalidItems: InvalidRssItem[];
}

export async function parseRssItems(
  rssResponse: RssResponse,
  buildRssItemFn = buildRssItem
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

export interface ValidRssItem {
  kind: 'ValidRssItem';
  value: RssItem;
}

interface InvalidRssItem {
  kind: 'InvalidRssItem';
  reason: string;
  item: ParsedRssItem;
}

export interface ParsedRssItem extends Item {
  author: string | undefined; // The Item interface of rss-parser is missing author?!
}

export function buildRssItem(item: ParsedRssItem, baseURL: URL): ValidRssItem | InvalidRssItem {
  if (!item.title?.trim()) {
    return {
      kind: 'InvalidRssItem',
      reason: 'Post title is missing',
      item,
    };
  }

  if (!item.content?.trim()) {
    return {
      kind: 'InvalidRssItem',
      reason: 'Post content is missing',
      item,
    };
  }

  if (!item.author?.trim()) {
    return {
      kind: 'InvalidRssItem',
      reason: 'Post author is missing',
      item,
    };
  }

  if (!item.isoDate?.trim()) {
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

  return {
    kind: 'ValidRssItem',
    value: {
      title: item.title,
      content: item.content,
      author: item.author,
      pubDate: new Date(item.isoDate),
      link: link,
    },
  };
}

function isValidRssItem(value: any): value is ValidRssItem {
  return value.kind === 'ValidRssItem';
}

function isInvalidRssItem(value: any): value is InvalidRssItem {
  return value.kind === 'InvalidRssItem';
}
