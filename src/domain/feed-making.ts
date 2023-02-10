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
  feedId?: string;
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

export function makeFeedDisplayName(input: unknown): Result<string> {
  if (!isString(input) || input.trim().length < 5 || input.trim().length > 50) {
    return makeErr(si`Invalid feed display name: "${String(input)}"`, 'displayName');
  }

  return input.trim();
}
