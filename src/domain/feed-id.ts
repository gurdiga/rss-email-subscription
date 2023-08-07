import { isString, makeErr, Result, hasKind } from '../shared/lang';
import { si } from '../shared/string-utils';
import { allowedCharacters } from './email-address-making';

export interface FeedId {
  kind: 'FeedId';
  value: string;
}

export function isFeedId(value: unknown): value is FeedId {
  return hasKind(value, 'FeedId');
}

const minFeedIdLength = 3;
export const maxFeedIdLength = 64; // See https://www.rfc-editor.org/errata/eid1690
const feedIdRe = new RegExp(si`^${allowedCharacters}+$`, 'i');

export function makeFeedId(input: any, field = 'id'): Result<FeedId> {
  if (!input) {
    return makeErr('Feed ID is missing', field);
  }

  if (!isString(input)) {
    return makeErr('Feed ID is not a string', field);
  }

  const value = input.trim();

  if (value.length === 0) {
    return makeErr('Feed ID is missing', field);
  }

  if (value.length < minFeedIdLength) {
    return makeErr(si`Feed ID needs to be at least ${minFeedIdLength} characters`, field);
  }

  if (value.length > maxFeedIdLength) {
    return makeErr(si`Feed ID needs to be max ${maxFeedIdLength} characters`, field);
  }

  if (!feedIdRe.test(value)) {
    return makeErr(si`Only letters, digits, "-", and "_" are allowed, but got "${value}"`, field);
  }

  const feedId: FeedId = {
    kind: 'FeedId',
    value: value,
  };

  return feedId;
}

export function makeSampleFeedId(): FeedId {
  const feedId: FeedId = {
    kind: 'FeedId',
    value: 'sample-feed-id',
  };

  return feedId;
}
