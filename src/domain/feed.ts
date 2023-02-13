import { EmailAddress } from './email-address';
import { getTypeName, isString, makeErr, Result, hasKind } from '../shared/lang';
import { si } from '../shared/string-utils';
import { UnixCronPattern } from './cron-pattern';
import { FeedId } from './feed-id';

export interface Feed {
  kind: 'Feed';
  id: FeedId;
  displayName: string;
  url: URL;
  hashingSalt: FeedHashingSalt;
  replyTo: EmailAddress;
  cronPattern: UnixCronPattern;
  isDeleted: boolean;
  isActive: boolean;
}

export function isFeed(value: unknown): value is Feed {
  return hasKind(value, 'Feed');
}

export interface FeedHashingSalt {
  kind: 'FeedHashingSalt';
  value: string;
}

const feedHashingSaltLength = 16;

export function makeFeedHashingSalt(input: unknown): Result<FeedHashingSalt> {
  if (!isString(input)) {
    return makeErr(si`Must be a string: ${getTypeName(input)} ${JSON.stringify(input)}`);
  }

  if (input.length !== feedHashingSaltLength) {
    return makeErr(si`Must have the length of ${feedHashingSaltLength}`);
  }

  return <FeedHashingSalt>{
    kind: 'FeedHashingSalt',
    value: input,
  };
}

export function isFeedHashingSalt(value: unknown): value is FeedHashingSalt {
  return hasKind(value, 'FeedHashingSalt');
}

export interface UiFeedListItem {
  displayName: string;
  feedId: FeedId;
}

export function makeUiFeedListItem(feed: Feed): UiFeedListItem {
  return {
    displayName: feed.displayName,
    feedId: feed.id,
  };
}

export interface UiFeed {
  displayName: string;
  url: string;
  email: string;
  replyTo: string;
  subscriberCount: number;
  isActive: boolean;
}

export function makeUiFeed(feed: Feed, domain: string, subscriberCount: number): UiFeed {
  return {
    displayName: feed.displayName,
    url: feed.url.toString(),
    email: si`${feed.id.value}@${domain}`,
    replyTo: feed.replyTo.value,
    subscriberCount,
    isActive: feed.isActive,
  };
}

export type MakeFeedRequest = Record<'displayName' | 'url' | 'id' | 'replyTo', string>;
export interface MakeFeedResponseData {
  feedId: string;
}
