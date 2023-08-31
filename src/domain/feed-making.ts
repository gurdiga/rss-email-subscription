import { makeValues, Result } from '../shared/lang';
import { makeUnixCronPattern } from './cron-pattern-making';
import {
  Feed,
  makeFeedDisplayName,
  makeFeedHashingSalt,
  makeFeedReplyToEmailAddress,
  makeFeedStatus,
  makeFeedUrl,
  makeOptionalFeedEmailBodySpec,
  makeOptionalFeedEmailSubjectSpec,
} from './feed';
import { makeFeedId } from './feed-id';

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
    emailBodySpec: makeOptionalFeedEmailBodySpec,
    emailSubjectSpec: makeOptionalFeedEmailSubjectSpec,
  });
}
