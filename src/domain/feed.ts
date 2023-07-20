import { getTypeName, hasKind, isString, makeErr, makePositiveInteger, makeValues, Result } from '../shared/lang';
import { si } from '../shared/string-utils';
import { UnixCronPattern } from './cron-pattern';
import { EmailAddress, HashedEmail } from './email-address';
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
  status: FeedStatus;
  emailBodySpec: FeedEmailBodySpec;
}

export function isFeed(value: unknown): value is Feed {
  return hasKind(value, 'Feed');
}

export type FeedEmailBodySpec = FullItemText | ItemExcerptWordCount;

interface FullItemText {
  kind: 'FullItemText';
}

export function makeFullItemText(): FullItemText {
  return {
    kind: 'FullItemText',
  };
}

interface ItemExcerptWordCount {
  kind: 'ItemExcerptWordCount';
  wordCount: number;
}

function makeItemExcerptWordCount(value: unknown): Result<ItemExcerptWordCount> {
  return makeValues<ItemExcerptWordCount>(value, {
    kind: 'ItemExcerptWordCount',
    wordCount: makePositiveInteger,
  });
}

export function makeFeedEmailBodySpec(value: unknown, field = 'emailBodySpec'): Result<FeedEmailBodySpec> {
  if (hasKind(value, 'FullItemText')) {
    return makeFullItemText();
  }

  if (hasKind(value, 'ItemExcerptWordCount')) {
    return makeItemExcerptWordCount(value);
  }

  return makeErr(si`Invalid value`, field);
}

export interface FeedHashingSalt {
  kind: 'FeedHashingSalt';
  value: string;
}

export const feedHashingSaltLength = 16;

export function makeFeedHashingSalt(input: unknown, field = 'hashingSalt'): Result<FeedHashingSalt> {
  if (!isString(input)) {
    return makeErr(si`Must be a string: ${getTypeName(input)} ${JSON.stringify(input)}`, field);
  }

  if (input.length !== feedHashingSaltLength) {
    return makeErr(si`Must have the length of ${feedHashingSaltLength}`, field);
  }

  const salt: FeedHashingSalt = {
    kind: 'FeedHashingSalt',
    value: input,
  };

  return salt;
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
  status: FeedStatus;
}

export enum FeedStatus {
  AwaitingReview = 'Awaiting Review',
  Approved = 'Approved',
  Rejected = 'Rejected',
}

export function makeFeedStatus(value: unknown, field = 'status'): Result<FeedStatus> {
  if (!value) {
    return makeErr('Missing feed status', field);
  }

  if (!isString(value)) {
    return makeErr(si`Invalid feed status type: ${getTypeName(value)}`, field);
  }

  const validValues = Object.values(FeedStatus);

  if (!validValues.includes(value as any)) {
    return makeErr(si`Invalid feed status: ${value}`, field);
  }

  return value as FeedStatus;
}

export type LoadFeedsResponseData = UiFeedListItem[];

export function makeUiFeed(feed: Feed, domain: string): UiFeed {
  return {
    id: feed.id.value,
    displayName: feed.displayName,
    url: feed.url.toString(),
    email: si`${feed.id.value}@${domain}`,
    replyTo: feed.replyTo.value,
    status: feed.status,
  };
}

export interface DeleteFeedRequest {
  feedId: FeedId;
}

export type DeleteFeedRequestData = Record<keyof DeleteFeedRequest, string>;

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

export interface EditFeedResponse {
  feedId: string;
}

export function makeEditFeedRequest(data: unknown): Result<EditFeedRequest> {
  return makeValues<EditFeedRequest>(data, {
    displayName: makeFeedDisplayName,
    url: makeFeedUrl,
    id: makeFeedId,
    initialId: makeFeedId,
    replyTo: makeFeedReplyToEmailAddress,
  });
}

type UiEmailList = string[];

export function makeUiEmailList(emails: HashedEmail[]): UiEmailList {
  return (
    emails
      // prettier: keep these stacked
      .filter((x) => x.isConfirmed)
      .map((x) => x.emailAddress.value)
  );
}

export interface LoadEmailsRequest {
  feedId: FeedId;
}

export type LoadEmailsRequestData = Record<keyof LoadEmailsRequest, string>;

export interface LoadEmailsResponse {
  displayName: string;
  emails: UiEmailList;
}

export type DeleteEmailsRequest = Record<'feedId' | 'emailsToDeleteOnePerLine', string>;

export interface DeleteEmailsResponse {
  currentEmails: UiEmailList;
}

export type AddEmailsRequest = Record<'feedId' | 'emailsOnePerLine', string>;

export interface AddEmailsResponse {
  newEmailsCount: number;
  currentEmails: UiEmailList;
}

export interface CheckFeedUrlRequest {
  blogUrl: URL;
}

export type CheckFeedUrlRequestData = Record<keyof CheckFeedUrlRequest, string>;

export interface CheckFeedUrlResponseData {
  feedUrls: string;
}

export interface SendingReport {
  newItems: number;
  subscribers: number;
  sentExpected: number;
  sent: number;
  failed: number;
}

export interface FeedManageScreenRequest {
  feedId: FeedId;
}

export type FeedManageScreenRequestData = Record<keyof FeedManageScreenRequest, string>;

export interface FeedManageScreenResponse {
  id: string;
  displayName: string;
  url: string;
  email: string;
  replyTo: string;
  status: FeedStatus;
  subscriberCount: number;
}

export interface ShowSampleEmailRequest {
  feedId: FeedId;
}

export type ShowSampleEmailRequestData = Record<keyof ShowSampleEmailRequest, string>;

export interface LoadFeedDisplayNameResponseData {
  displayName: string;
}
