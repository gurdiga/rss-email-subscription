import { si } from './string-utils';

// TODO: Rename to PagePath?
export enum PagePaths {
  userAuthentication = '/user/authentication.html',
  userStart = '/user/feeds.html',
  feedList = '/user/feeds.html',
  feedManage = '/user/manage-feed.html',
  feedEdit = '/user/edit-feed.html',
  manageFeedSubscribers = '/user/manage-feed-subscribers.html',
  registrationConfirmation = '/user/registration-confirmation.html',
}

export function makePagePathWithParams(pagePath: PagePaths, params: Record<string, string>) {
  const queryParams = new URLSearchParams(params).toString();

  return si`${pagePath}?${queryParams}`;
}
