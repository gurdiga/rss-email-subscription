import { isString, makeErr, Result, hasKind } from '../shared/lang';
import { si } from '../shared/string-utils';

export interface FeedId {
  kind: 'FeedId';
  value: string;
}

export function isFeedId(value: unknown): value is FeedId {
  return hasKind(value, 'FeedId');
}

const minFeedIdLength = 3;
export const maxFeedIdLength = 64; // See https://www.rfc-editor.org/errata/eid1690

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

  const feedId: FeedId = {
    kind: 'FeedId',
    value: value,
  };

  return feedId;
}
