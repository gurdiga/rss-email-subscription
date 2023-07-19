import { getTypeName, isErr, isString, makeErr, makeValues, Result } from '../shared/lang';
import { si } from '../shared/string-utils';
import { makeHttpUrl } from '../shared/url';
import { makeUnixCronPattern } from './cron-pattern-making';
import { EmailAddress } from './email-address';
import { makeEmailAddress } from './email-address-making';
import { Feed, FeedStatus, makeFeedHashingSalt, makeFeedStatus } from './feed';
import { makeFeedId } from './feed-id';

export interface MakeFeedInput {
  displayName?: string;
  url?: string;
  hashingSalt?: string;
  id?: string;
  replyTo?: string;
  cronPattern?: string;
  isDeleted?: boolean;
  status?: FeedStatus;
}

export function makeFeed(input: unknown): Result<Feed> {
  return makeValues<Feed>(input, {
    kind: 'Feed',
    url: makeFeedUrl,
    displayName: makeFeedDisplayName,
    id: makeFeedId,
    hashingSalt: makeFeedHashingSalt,
    replyTo: makeFeedReplyToEmailAddress,
    cronPattern: makeUnixCronPattern,
    status: makeFeedStatus,
  });
}

export function makeFeedReplyToEmailAddress(input: unknown): Result<EmailAddress> {
  const emailAddress = makeEmailAddress(input);

  if (isErr(emailAddress)) {
    return makeErr(si`Invalid Reply To email: ${emailAddress.reason}`, 'replyTo');
  }

  if (emailAddress.value.endsWith('@feedsubscription.com')) {
    return makeErr('Reply To email can’t be @FeedSubscription.com', 'replyTo');
  }

  return emailAddress;
}

export function makeFeedUrl(input: unknown, field = 'url'): Result<URL> {
  if (!input) {
    return makeErr('Feed URL is missing', field);
  }

  if (!isString(input)) {
    return makeErr(si`Feed URL has the wrong type: "${getTypeName(input)}"`, field);
  }

  const trimmedUrl = input.trim();

  if (!trimmedUrl) {
    return makeErr('Feed URL is missing', field);
  }

  return makeHttpUrl(trimmedUrl, undefined, field);
}

const minFeedNameLength = 5;
export const maxFeedNameLength = 50;

export function makeFeedDisplayName(input: unknown, field = 'displayName'): Result<string> {
  if (!input) {
    return makeErr('Feed name is missing', field);
  }

  if (!isString(input)) {
    return makeErr(si`Invalid blog feed name: expected type [string] but got "${getTypeName(input)}"`, field);
  }

  const trimmedInput = input.trim();

  if (!trimmedInput) {
    return makeErr('Feed name is missing', field);
  }

  if (trimmedInput.length < minFeedNameLength) {
    return makeErr(si`Feed name is too short. I needs to be at least ${minFeedNameLength} characters.`, field);
  }

  if (trimmedInput.length > maxFeedNameLength) {
    return makeErr(si`Feed name is too long. It needs to be less than ${maxFeedNameLength} characters.`, field);
  }

  return trimmedInput;
}
