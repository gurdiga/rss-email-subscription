import { EmailAddress } from './email-address';
import { getTypeName, isString, makeErr, Result, hasKind, isObject, isErr } from '../shared/lang';
import { si } from '../shared/string-utils';
import { UnixCronPattern } from './cron-pattern';
import { FeedId, makeFeedId } from './feed-id';
import { makeFeedDisplayName, makeFeedReplyToEmailAddress, makeFeedUrl } from './feed-making';

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
  id: string;
  displayName: string;
  url: string;
  email: string;
  replyTo: string;
  subscriberCount: number;
  isActive: boolean;
}

export function makeUiFeed(feed: Feed, domain: string, subscriberCount: number): UiFeed {
  return {
    id: feed.id.value,
    displayName: feed.displayName,
    url: feed.url.toString(),
    email: si`${feed.id.value}@${domain}`,
    replyTo: feed.replyTo.value,
    subscriberCount,
    isActive: feed.isActive,
  };
}

export type AddNewFeedRequestData = Record<'displayName' | 'url' | 'id' | 'replyTo', string>;
export interface AddNewFeedResponseData {
  feedId: string;
}

export interface EditFeedRequest {
  displayName: string;
  url: URL;
  id: FeedId;
  initialId: FeedId;
  replyTo: EmailAddress;
}

export type EditFeedRequestData = Record<keyof EditFeedRequest, string>;

export interface EditFeedResponseData {
  feedId: string;
}

export function makeEditFeedRequest(input: unknown): Result<EditFeedRequest> {
  if (!isObject(input)) {
    return makeErr(si`Invalid input type: ${getTypeName(input)}`);
  }

  const editFeedRequestData = input as EditFeedRequestData;
  const displayName = makeFeedDisplayName(editFeedRequestData.displayName);

  if (isErr(displayName)) {
    return displayName;
  }

  const url = makeFeedUrl(editFeedRequestData.url);

  if (isErr(url)) {
    return url;
  }

  const id = makeFeedId(editFeedRequestData.id);

  if (isErr(id)) {
    return id;
  }

  const initialId = makeFeedId(editFeedRequestData.initialId, 'initialId');

  if (isErr(initialId)) {
    return initialId;
  }

  const replyTo = makeFeedReplyToEmailAddress(editFeedRequestData.replyTo);

  if (isErr(replyTo)) {
    return replyTo;
  }

  return { displayName, id, initialId, url, replyTo };
}
