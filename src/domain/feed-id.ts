import { isString, makeErr, Result, hasKind } from '../shared/lang';

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
