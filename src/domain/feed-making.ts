import { makeEmailAddress } from './email-address-making';
import { getTypeName, isErr, isObject, isString, makeErr, Result } from '../shared/lang';
import { si } from '../shared/string-utils';
import { makeUrl } from '../shared/url';
import { FeedHashingSalt, Feed } from './feed';
import { makeFeedId } from './feed-id';
import { UnixCronPattern } from './cron-pattern';

export interface MakeFeedInput {
  displayName?: string;
  url?: string;
  id?: string;
  replyTo?: string;
  isDeleted?: boolean;
  isActive?: boolean;
}

export function makeFeed(
  input: MakeFeedInput,
  hashingSalt: FeedHashingSalt,
  cronPattern: UnixCronPattern
): Result<Feed> {
  if (!isObject(input)) {
    return makeErr(si`Invalid input type: expected [object] but got [${getTypeName(input)}]`);
  }

  const displayName = makeFeedDisplayName(input.displayName);

  if (isErr(displayName)) {
    return displayName;
  }

  if (!isString(input.url)) {
    return makeErr(si`Feed URL has the wrong type: "${getTypeName(input.url)}"`, 'url');
  }

  const trimmedUrl = input.url.trim();

  if (!trimmedUrl) {
    return makeErr('Feed URL is missing', 'url');
  }

  const url = makeUrl(trimmedUrl);

  if (isErr(url)) {
    return makeErr(si`Invalid feed URL: "${trimmedUrl}"`, 'url');
  }

  const id = makeFeedId(input.id);

  if (isErr(id)) {
    return id;
  }

  const replyTo = makeEmailAddress(input.replyTo);

  if (isErr(replyTo)) {
    return makeErr(si`Invalid Reply To email`, 'replyTo');
  }

  const isDeleted = Boolean(input.isDeleted);
  const isActive = Boolean(input.isActive);

  const feed: Feed = {
    kind: 'Feed',
    id,
    displayName,
    url,
    hashingSalt,
    replyTo,
    cronPattern,
    isDeleted,
    isActive,
  };

  return feed;
}

export const maxFeedNameLength = 50;

export function makeFeedDisplayName(input: unknown): Result<string> {
  if (!input) {
    return makeErr('Feed name is missing', 'displayName');
  }

  if (!isString(input)) {
    return makeErr(si`Invalid feed name: expected type [string] but got "${getTypeName(input)}"`, 'displayName');
  }

  const trimmedInput = input.trim();

  if (!trimmedInput) {
    return makeErr('Feed name is missing', 'displayName');
  }

  if (trimmedInput.length < 5) {
    return makeErr('Feed name is too short', 'displayName');
  }

  if (trimmedInput.length > maxFeedNameLength) {
    return makeErr('Feed name is too long', 'displayName');
  }

  return trimmedInput;
}
