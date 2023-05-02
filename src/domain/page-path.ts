import { isEmptyObject } from '../shared/lang';
import { si } from '../shared/string-utils';

export enum PagePath {
  home = '/',
  userAuthentication = '/user/authentication.html',
  userStart = '/user/feeds.html',
  feedList = '/user/feeds.html',
  feedManage = '/user/manage-feed.html',
  feedEdit = '/user/edit-feed.html',
  feedSubscribeForm = '/user/feed-subscribe-form.html',
  deliveryReports = '/user/delivery-reports.html',
  manageFeedSubscribers = '/user/manage-feed-subscribers.html',
  registration = '/user/registration.html',
  registrationConfirmation = '/user/registration-confirmation.html',
  emailChangeConfirmation = '/user/email-change-confirmation.html',
}

export interface FeedSubscribeFormParams {
  id: string;
  displayName: string;
}

export interface DeliveryReportsParams {
  id: string;
  displayName: string;
}

export interface FeedManageParams {
  id: string;
}

export interface FeedEditParams {
  id: string;
}

export interface ManageFeedSubscribersParams {
  id: string;
}

export function makePagePathWithParams<T>(pagePath: PagePath, params: Record<keyof T, string>) {
  const queryParams = isEmptyObject(params) ? '' : '?' + new URLSearchParams(params).toString();

  return si`${pagePath}${queryParams}`;
}
