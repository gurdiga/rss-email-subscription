import Parser, { Item } from 'rss-parser';
import { RssItem } from '../../domain/rss-item';
import { isEmpty, sortBy, SortDirection } from '../../shared/array-utils';
import { getErrorMessage, hasKind, isErr, makeErr, Result } from '../../shared/lang';
import { si } from '../../shared/string-utils';
import { makeHttpUrl } from '../../shared/url';
import { fetchRss, RssResponse } from './rss-response';

export interface RssFeed {
  kind: 'RssFeed';
  title: string;
  validItems: RssItem[];
  invalidItems: InvalidRssItem[];
}

export const maxValidItems = 10;

export async function parseRssFeed(
  rssResponse: RssResponse,
  buildRssItemFn: MakeRssItemFn = makeRssItem
): Promise<Result<RssFeed>> {
  const parser = new Parser();

  try {
    const feed = await parser.parseString(rssResponse.xml);

    try {
      const defaultItemTitle = feed.title || rssResponse.baseURL.hostname;
      const items = feed.items.map((item) =>
        buildRssItemFn(item as ParsedRssItem, rssResponse.baseURL, defaultItemTitle)
      );

      const validItems = items
        .filter(isValidRssItem)
        .map((i) => i.value)
        .sort(sortBy((i) => i.pubDate, SortDirection.Desc))
        .slice(0, maxValidItems);
      const invalidItems = items.filter(isInvalidRssItem);

      return {
        kind: 'RssFeed',
        title: feed.title || 'Untitled Blog',
        validItems,
        invalidItems,
      };
    } catch (error) {
      return makeErr(si`Failed to parse RSS: ${getErrorMessage(error)}`);
    }
  } catch (error) {
    return makeErr(si`Invalid XML: ${getErrorMessage(error)}`);
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
  id?: string; // Atom feeds have "id" instead of "guid". Please see https://validator.w3.org/feed/docs/atom.html#sampleFeed
  ['content:encoded']?: string; // Please see https://www.w3.org/wiki/RssContent
}

export interface ValidRssItem {
  kind: 'ValidRssItem';
  value: RssItem;
}

function isValidRssItem(value: unknown): value is ValidRssItem {
  return hasKind(value, 'ValidRssItem');
}

export type MakeRssItemFn = typeof makeRssItem;

export function makeRssItem(item: ParsedRssItem, baseURL: URL, defaultTitle: string): ValidRssItem | InvalidRssItem {
  const { isoDate } = item;

  const title = item.title || defaultTitle;

  let content = item['content:encoded'] || item.content || item.summary;
  const author = item.author || item.creator || 'Anonymous Coward';

  const isMissing = (value: string | undefined): value is undefined => !value?.trim();
  const invalidRssItem = (reason: string) => ({ kind: 'InvalidRssItem' as const, reason, item });

  if (isMissing(title)) {
    return invalidRssItem('Post title is missing');
  }

  if (isMissing(content)) {
    content = 'Post content is missing';
  }

  if (isMissing(isoDate)) {
    return invalidRssItem('Post publication timestamp is missing');
  }

  const linkString = item.link?.trim();

  if (!linkString) {
    return invalidRssItem('Post link is missing');
  }

  const link = makeHttpUrl(linkString, baseURL);

  if (isErr(link)) {
    return invalidRssItem('Post link is not a valid URL');
  }

  const pubDate = new Date(isoDate?.trim());

  if (pubDate.toString() === 'Invalid Date') {
    return invalidRssItem('Post publication timestamp is not a valid JSON date string');
  }

  const guid = item.guid || item.id || link.toString();
  const value: RssItem = { title, content, author, pubDate, link, guid };

  return {
    kind: 'ValidRssItem',
    value,
  };
}

function isInvalidRssItem(value: unknown): value is InvalidRssItem {
  return hasKind(value, 'InvalidRssItem');
}

interface FeedInfo {
  title: string;
  mostRecentItem: RssItem;
}

export async function getFeedInfo(url: URL): Promise<Result<FeedInfo>> {
  const rssResponse = await fetchRss(url);

  if (isErr(rssResponse)) {
    return makeErr(si`Failed to ${fetchRss.name}: ${rssResponse.reason}`);
  }

  const rssParsingResult = await parseRssFeed(rssResponse);

  if (isErr(rssParsingResult)) {
    return makeErr(si`Failed to ${parseRssFeed.name}: ${rssParsingResult.reason}`);
  }

  const { title, validItems, invalidItems } = rssParsingResult;

  if (isEmpty(validItems) && isEmpty(invalidItems)) {
    return makeErr('No RSS items');
  }

  const mostRecentItem = validItems[0];

  if (!mostRecentItem) {
    return makeErr('No valid RSS items');
  }

  const result: FeedInfo = {
    title,
    mostRecentItem,
  };

  return result;
}
