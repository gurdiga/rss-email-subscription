import { EmailAddress, makeEmailAddress } from '../app/email-sending/emails';
import { getTypeName, isErr, isObject, isString, makeErr, Result, hasKind } from '../shared/lang';
import { si } from '../shared/string-utils';
import { makeUrl } from '../shared/url';
import { makeUnixCronPattern, UnixCronPattern } from './cron-pattern';

export interface Feed {
  kind: 'Feed';
  id: FeedId;
  displayName: string;
  url: URL;
  hashingSalt: FeedHashingSalt;
  replyTo: EmailAddress;
  cronPattern: UnixCronPattern;
  isDeleted: boolean;
}

export interface MakeFeedInput {
  displayName?: string;
  url?: string;
  feedId?: string;
  replyTo?: string;
  cronPattern?: string;
  isDeleted?: boolean;
}

export function makeFeed(input: MakeFeedInput, hashingSalt: FeedHashingSalt): Result<Feed> {
  if (!isObject(input)) {
    return makeErr('Invalid input');
  }

  const displayName = makeFeedDisplayName(input.displayName);

  if (isErr(displayName)) {
    return displayName;
  }

  const id = makeFeedId(input.feedId);

  if (isErr(id)) {
    return makeErr(si`Invalid feed ID: "${String(input.feedId)}"`, 'id');
  }

  if (!isString(input.url)) {
    return makeErr(si`Non-string feed URL: "${input.url!}"`, 'url');
  }

  const url = makeUrl(input.url);

  if (isErr(url)) {
    return makeErr(si`Invalid feed URL: "${input.url}"`, 'url');
  }

  const replyTo = makeEmailAddress(input.replyTo);

  if (isErr(replyTo)) {
    return makeErr(si`Invalid Reply To email: "${input.replyTo!}"`, 'replyTo');
  }

  const cronPattern = makeUnixCronPattern(input.cronPattern);

  if (isErr(cronPattern)) {
    return makeErr(si`Invalid cronPattern: "${input.cronPattern!}"`, 'cronPattern');
  }

  const isDeleted = Boolean(input.isDeleted);

  return <Feed>{
    kind: 'Feed',
    id,
    displayName,
    url,
    hashingSalt,
    replyTo,
    cronPattern,
    isDeleted,
  };
}

function makeFeedDisplayName(input: unknown): Result<string> {
  if (!isString(input) || input.trim().length < 5 || input.trim().length > 50) {
    return makeErr(si`Invalid feed display name: "${String(input)}"`, 'displayName');
  }

  return input.trim();
}

export interface FeedId {
  kind: 'FeedId';
  value: string;
}

export function isFeedId(value: unknown): value is FeedId {
  return hasKind(value, 'FeedId');
}

export function makeFeedId(input: any): Result<FeedId> {
  if (!isString(input)) {
    return makeErr('Is not a string', input);
  }

  const value = input.trim();

  if (value.length === 0) {
    return makeErr('Is empty', value);
  }

  if (value.length < 3) {
    return makeErr('Is too short', value);
  }

  return <FeedId>{
    kind: 'FeedId',
    value: value,
  };
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
