import { isEmptyObject } from '../shared/lang';
import { si } from '../shared/string-utils';

export const apiBasePath = '/api';

export enum ApiPath {
  webUiScripts = '/web-ui-scripts',
  versionTxt = '/version.txt',
  corsTest = '/cors-test',
  sessionTest = '/session-test',
  loadFeeds = '/feeds',
  loadFeedById = '/feeds/load-by-id',
  feedManageScreen = '/feeds/manage-screen',
  loadFeedSubscribers = '/feeds/subscribers',
  deleteFeedSubscribers = '/feeds/delete-subscribers',
  addFeedSubscribers = '/feeds/add-subscribers',
  addNewFeed = '/feeds/add-new-feed',
  editFeed = '/feeds/edit-feed',
  deleteFeed = '/feeds/delete-feed',
  subscription = '/subscription',
  subscriptionConfirmation = '/subscription-confirmation',
  unsubscription = '/unsubscription',
  registration = '/registration',
  registrationConfirmation = '/registration-confirmation',
  authentication = '/authentication',
  deauthentication = '/deauthentication',
  loadCurrentAccount = '/account',
  requestAccountEmailChange = '/account/request-change-email',
  confirmAccountEmailChange = '/account/confirm-change-email',
  requestAccountPlanChange = '/account/request-plan-email',
  requestAccountPasswordChange = '/account/request-change-password',
  checkFeedUrl = '/check-feed-url',
}

export function getFullApiPath(path: ApiPath, params: Record<string, string> = {}): string {
  const queryParams = isEmptyObject(params) ? '' : '?' + new URLSearchParams(params).toString();

  return si`${apiBasePath}${path}${queryParams}`;
}
