import { isEmptyObject } from '../shared/lang';
import { si } from '../shared/string-utils';

export enum PagePath {
  home = '/',
  userAuthentication = '/user/authentication.html',
  userStart = '/user/feeds.html',
  requestPasswordReset = '/user/request-password-reset.html',
  confirmPasswordReset = '/user/confirm-password-reset.html',
  feedList = '/user/feeds.html',
  feedManage = '/user/manage-feed.html',
  feedEdit = '/user/edit-feed.html',
  feedSubscribeForm = '/user/feed-subscribe-form.html',
  deliveryReports = '/user/delivery-reports.html',
  manageFeedSubscribers = '/user/manage-feed-subscribers.html',
  registration = '/user/registration.html',
  registrationConfirmation = '/user/registration-confirmation.html',
  emailChangeConfirmation = '/user/email-change-confirmation.html',
  accountPage = '/user/account.html',
}

export const privatePaths = [
  PagePath.accountPage,
  PagePath.feedList,
  '/user/add-new-feed.html',
  PagePath.feedEdit,
  PagePath.feedManage,
  PagePath.manageFeedSubscribers,
  PagePath.deliveryReports,
  PagePath.feedSubscribeForm,
];

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
  idChanged: 'true' | 'false';
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
