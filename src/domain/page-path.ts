import { isEmptyObject } from '../shared/lang';
import { si } from '../shared/string-utils';

export enum PagePath {
  userAuthentication = '/user/authentication.html',
  userStart = '/user/feeds.html',
  feedList = '/user/feeds.html',
  feedManage = '/user/manage-feed.html',
  feedEdit = '/user/edit-feed.html',
  manageFeedSubscribers = '/user/manage-feed-subscribers.html',
  registrationConfirmation = '/user/registration-confirmation.html',
  emailChangeConfirmation = '/user/email-change-confirmation.html',
}

export function makePagePathWithParams(pagePath: PagePath, params: Record<string, string>) {
  const queryParams = isEmptyObject(params) ? '' : '?' + new URLSearchParams(params).toString();

  return si`${pagePath}${queryParams}`;
}
