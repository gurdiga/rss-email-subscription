import { EmailAddress, HashedEmail } from './email-address';
import { getTypeName, isString, makeErr, Result, hasKind, isObject, isErr, hasKey } from '../shared/lang';
import { si } from '../shared/string-utils';
import { UnixCronPattern } from './cron-pattern';
import { FeedId, makeFeedId } from './feed-id';
import { makeFeedDisplayName, makeFeedReplyToEmailAddress, makeFeedUrl } from './feed-making';
import { sortBy } from '../shared/array-utils';

export interface Feed {
  kind: 'Feed';
  id: FeedId;
  displayName: string;
  url: URL;
  hashingSalt: FeedHashingSalt;
  replyTo: EmailAddress;
  cronPattern: UnixCronPattern;
  isDeleted: boolean;
  status: FeedStatus;
}

export function isFeed(value: unknown): value is Feed {
  return hasKind(value, 'Feed');
}

export interface FeedHashingSalt {
  kind: 'FeedHashingSalt';
  value: string;
}

export const feedHashingSaltLength = 16;

export function makeFeedHashingSalt(input: unknown): Result<FeedHashingSalt> {
  if (!isString(input)) {
    return makeErr(si`Must be a string: ${getTypeName(input)} ${JSON.stringify(input)}`);
  }

  if (input.length !== feedHashingSaltLength) {
    return makeErr(si`Must have the length of ${feedHashingSaltLength}`);
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
  subscriberCount: number;
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

export function makeUiFeed(feed: Feed, domain: string, subscriberCount: number): UiFeed {
  return {
    id: feed.id.value,
    displayName: feed.displayName,
    url: feed.url.toString(),
    email: si`${feed.id.value}@${domain}`,
    replyTo: feed.replyTo.value,
    subscriberCount,
    status: feed.status,
  };
}

export type AddNewFeedRequestData = Record<'displayName' | 'url' | 'id' | 'replyTo', string>;
export interface AddNewFeedResponseData {
  feedId: string;
}

export function isAddNewFeedRequestData(value: unknown): value is AddNewFeedRequestData {
  const expectedKeys: (keyof AddNewFeedRequestData)[] = ['displayName', 'url', 'id', 'replyTo'];

  return expectedKeys.every((keyName) => hasKey(value, keyName));
}

export interface EditFeedRequest {
  displayName: string;
  url: URL;
  id: FeedId;
  initialId: FeedId;
  replyTo: EmailAddress;
}

export type EditFeedRequestData = Record<keyof EditFeedRequest, string>;

export interface EditFeedResponseData {
  feedId: string;
}

export function makeEditFeedRequest(input: unknown): Result<EditFeedRequest> {
  if (!isObject(input)) {
    return makeErr(si`Invalid input type: ${getTypeName(input)}`);
  }

  const editFeedRequestData = input as EditFeedRequestData;
  const displayName = makeFeedDisplayName(editFeedRequestData.displayName);

  if (isErr(displayName)) {
    return displayName;
  }

  const url = makeFeedUrl(editFeedRequestData.url);

  if (isErr(url)) {
    return url;
  }

  const id = makeFeedId(editFeedRequestData.id);

  if (isErr(id)) {
    return id;
  }

  const initialId = makeFeedId(editFeedRequestData.initialId, 'initialId');

  if (isErr(initialId)) {
    return initialId;
  }

  const replyTo = makeFeedReplyToEmailAddress(editFeedRequestData.replyTo);

  if (isErr(replyTo)) {
    return replyTo;
  }

  return { displayName, id, initialId, url, replyTo };
}

type UiEmailList = string[];

export function makeUiEmailList(emails: HashedEmail[]): UiEmailList {
  return emails
    .filter((x) => x.isConfirmed)
    .map((x) => x.emailAddress.value)
    .sort(byDomainAndThenByLocalPart);
}

export const byDomainAndThenByLocalPart = sortBy((x: string) => {
  const [localPart, domain] = x.split('@');
  return [domain, localPart].join('');
});

export interface LoadEmailsResponseData {
  displayName: string;
  emails: UiEmailList;
}

export type DeleteEmailsRequest = Record<'emailsToDeleteJoinedByNewLines', string>;

export interface DeleteEmailsResponseData {
  currentEmails: UiEmailList;
}
