import {
  getTypeName,
  hasKind,
  isErr,
  isString,
  makeErr,
  makeNonEmptyString,
  makePositiveInteger,
  makeTypeMismatchErr,
  makeValues,
  Result,
} from '../shared/lang';
import { si } from '../shared/string-utils';
import { makeHttpUrl } from '../shared/url';
import { UnixCronPattern } from './cron-pattern';
import { EmailAddress, HashedEmail } from './email-address';
import { makeEmailAddress } from './email-address-making';
import { FeedId, makeFeedId } from './feed-id';

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
  emailSubjectSpec: FeedEmailSubjectSpec;
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

export function isFullItemText(value: unknown): value is FullItemText {
  return hasKind(value, 'FullItemText');
}

type FullItemTextString = string;

export function makeFullItemTextString(): FullItemTextString {
  return 'full-item-text';
}

export interface ItemExcerptWordCount {
  kind: 'ItemExcerptWordCount';
  wordCount: number;
}

export function isItemExcerptWordCount(value: unknown): value is ItemExcerptWordCount {
  return hasKind(value, 'ItemExcerptWordCount');
}

export const defaultExcerptWordCount = 200;
export const minExcerptWordCount = 50;
export const maxExcerptWordCount = 10_000;

export function makeItemExcerptWordCount(value: unknown, field?: string): Result<ItemExcerptWordCount> {
  if (!isString(value)) {
    return makeTypeMismatchErr(value, 'string');
  }

  const matches = value.match(/^(\d+) words$/);

  if (!matches) {
    return makeErr('Invalid word count excerpt string', field);
  }

  const wordCount = makePositiveInteger(matches[1], field);

  if (isErr(wordCount)) {
    return wordCount;
  }

  if (wordCount < minExcerptWordCount) {
    return makeErr(si`Min word count is ${minExcerptWordCount}`, field);
  }

  if (wordCount > maxExcerptWordCount) {
    return makeErr(si`Max word count is ${maxExcerptWordCount}`, field);
  }

  return {
    kind: 'ItemExcerptWordCount',
    wordCount,
  };
}

type ItemExcerptWordCountString = string;

export function makeItemExcerptWordCountString(wordCount: number): ItemExcerptWordCountString {
  return si`${wordCount} words`;
}

export function makeFeedEmailBodySpec(value: unknown): Result<FeedEmailBodySpec> {
  if (value === makeFullItemTextString()) {
    return makeFullItemText();
  }

  return makeItemExcerptWordCount(value, 'emailBodyExcerptWordCount');
}

export function makeOptionalFeedEmailBodySpec(value: unknown): Result<FeedEmailBodySpec> {
  if (!value) {
    return makeFullItemText();
  } else {
    return makeFeedEmailBodySpec(value);
  }
}

export function makeFeedEmailBodySpecString(emailBodySpec: FeedEmailBodySpec): string {
  if (emailBodySpec.kind === 'FullItemText') {
    return makeFullItemTextString();
  } else {
    return makeItemExcerptWordCountString(emailBodySpec.wordCount);
  }
}

export type FeedEmailSubjectSpec = ItemTitle | CustomSubject;

interface ItemTitle {
  kind: 'ItemTitle';
}

export function makeItemTitle(): ItemTitle {
  return { kind: 'ItemTitle' };
}

export function isItemTitle(value: unknown): value is ItemTitle {
  return hasKind(value, 'ItemTitle');
}

export const customSubjectMaxLength = 60;

interface CustomSubject {
  kind: 'CustomSubject';
  text: string;
}

type ItemTitleString = 'item-title';

export function makeItemTitleString(): ItemTitleString {
  return 'item-title';
}

type CustomSubjectString = string;

export function makeCustomSubjectString(text: string, field = 'emailSubjectCustomText'): Result<string> {
  const nonEmptyString = makeNonEmptyString(text, field);

  if (isErr(nonEmptyString)) {
    return nonEmptyString;
  }

  if (nonEmptyString.length > customSubjectMaxLength) {
    return makeErr(si`Max length is ${customSubjectMaxLength}`, field);
  }

  return nonEmptyString;
}

export function makeFeedEmailCustomSubject(value: unknown): Result<CustomSubject> {
  if (!isString(value)) {
    return makeTypeMismatchErr(value, 'string');
  }

  const nonEmptyValue = makeCustomSubjectString(value.slice(0, customSubjectMaxLength));

  if (isErr(nonEmptyValue)) {
    return nonEmptyValue;
  }

  return {
    kind: 'CustomSubject',
    text: nonEmptyValue,
  };
}

export function makeFeedEmailSubjectSpecString(emailSubjectSpec: FeedEmailSubjectSpec): string {
  if (isItemTitle(emailSubjectSpec)) {
    return makeItemTitleString();
  }

  return emailSubjectSpec.text;
}

export function makeFeedEmailSubjectSpec(value: unknown): Result<FeedEmailSubjectSpec> {
  if (value === makeItemTitleString()) {
    return makeItemTitle();
  }

  return makeFeedEmailCustomSubject(value);
}

export function makeOptionalFeedEmailSubjectSpec(value: unknown): Result<FeedEmailSubjectSpec> {
  if (!value) {
    return makeItemTitle();
  } else {
    return makeFeedEmailSubjectSpec(value);
  }
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
  emailBodySpec: FullItemTextString | ItemExcerptWordCountString;
  emailSubjectSpec: ItemTitleString | CustomSubjectString;
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
    emailBodySpec: makeFeedEmailBodySpecString(feed.emailBodySpec),
    emailSubjectSpec: makeFeedEmailSubjectSpecString(feed.emailSubjectSpec),
    replyTo: feed.replyTo.value,
    status: feed.status,
  };
}

export interface DeleteFeedRequest {
  feedId: FeedId;
}

export type DeleteFeedRequestData = Record<keyof DeleteFeedRequest, string>;

type FeedUiFields = keyof Omit<Feed, 'kind' | 'status' | 'hashingSalt' | 'cronPattern'>;
export type AddNewFeedRequestData = Record<FeedUiFields, string>;

export interface AddNewFeedResponseData {
  feedId: string;
}

export interface EditFeedRequest {
  displayName: string;
  url: URL;
  id: FeedId;
  emailBodySpec: FeedEmailBodySpec;
  emailSubjectSpec: FeedEmailSubjectSpec;
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
    emailBodySpec: makeFeedEmailBodySpec,
    emailSubjectSpec: makeFeedEmailSubjectSpec,
    initialId: makeFeedId,
    replyTo: makeFeedReplyToEmailAddress,
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
  feedUrl: string;
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
  emailBodySpec: string;
  emailSubjectSpec: string;
  replyTo: string;
  status: FeedStatus;
  subscriberCount: number;
}

export interface ShowSampleEmailRequest {
  feedId: FeedId;
}

export type ShowSampleEmailRequestData = Record<keyof ShowSampleEmailRequest, string>;

export interface PublicShowSampleEmailRequest {
  feedUrl: URL;
  recipientEmail: EmailAddress;
}

export type PublicShowSampleEmailRequestData = Record<keyof PublicShowSampleEmailRequest, string>;

export interface PublicShowSampleEmailResponse {
  sender: string;
  emailSubject: string;
}

export interface LoadFeedDisplayNameResponseData {
  displayName: string;
}
