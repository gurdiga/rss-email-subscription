import { makeEmailAddress } from '../app/email-sending/emails';
import { isErr, isObject, isString, makeErr, Result } from '../shared/lang';
import { si } from '../shared/string-utils';
import { makeUrl } from '../shared/url';
import { makeUnixCronPattern } from './cron-pattern-making';
import { FeedHashingSalt, Feed, makeFeedId } from './feed';

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

export function makeFeedDisplayName(input: unknown): Result<string> {
  if (!isString(input) || input.trim().length < 5 || input.trim().length > 50) {
    return makeErr(si`Invalid feed display name: "${String(input)}"`, 'displayName');
  }

  return input.trim();
}
