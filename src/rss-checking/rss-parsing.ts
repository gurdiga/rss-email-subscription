import Parser, { Item } from 'rss-parser';
import { ValidRssResponse } from './rss-response';

export interface RssItem {
  title: string;
  content: string;
  publicationTimestamp: Date;
  link: URL;
}

export interface ValidRssParseResult {
  kind: 'ValidRssParseResult';
  validItems: RssItem[];
  invalidItems: InvalidRssItem[];
}

interface InvalidRssParseResult {
  kind: 'ValidRssParseResult';
  reason: string;
}

export async function parseRssItems(rssResponse: ValidRssResponse): Promise<ValidRssParseResult> {
  const parser = new Parser();
  const feed = await parser.parseString(rssResponse.xml);
  const items = feed.items.map((item) => buildRssItem(item, rssResponse.baseURL));
  const validItems = items.filter(isValidRssItem).map((i) => i.value);
  const invalidItems = items.filter(isInvalidRssItem);

  return {
    kind: 'ValidRssParseResult',
    validItems,
    invalidItems,
  };
}

export interface ValidRssItem {
  kind: 'ValidRssItem';
  value: RssItem;
}

function isValidRssItem(value: any): value is ValidRssItem {
  return value.kind === 'ValidRssItem';
}

function isInvalidRssItem(value: any): value is InvalidRssItem {
  return value.kind === 'InvalidRssItem';
}

interface InvalidRssItem {
  kind: 'InvalidRssItem';
  reason: string;
  item: Item;
}

export function buildRssItem(item: Item, baseURL: URL): ValidRssItem | InvalidRssItem {
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
      publicationTimestamp: new Date(item.isoDate),
      link: link,
    },
  };
}
