import { isEmptyObject } from '../shared/lang';
import { si } from '../shared/string-utils';

export const apiBasePath = '/api';

export enum ApiPath {
  webUiScripts = '/web-ui-scripts',
  versionTxt = '/version.txt',
  corsTest = '/cors-test',
  sessionTest = '/session-test',
  loadFeeds = '/feeds',
  loadFeedDisplayName = '/feeds/get-display-name-by-id',
  loadFeedById = '/feeds/load-by-id',
  manageFeed = '/feeds/manage-feed',
  loadFeedSubscribers = '/feeds/subscribers',
  deleteFeedSubscribers = '/feeds/delete-subscribers',
  addFeedSubscribers = '/feeds/add-subscribers',
  addNewFeed = '/feeds/add-new-feed',
  editFeed = '/feeds/edit-feed',
  deleteFeed = '/feeds/delete-feed',
  showSampleEmail = '/feeds/show-sample-email',
  showSampleEmailPublic = '/feeds/show-sample-email-public',
  subscription = '/subscription',
  subscriptionConfirmation = '/subscription-confirmation',
  unsubscription = '/unsubscription',
  registration = '/registration',
  registrationConfirmation = '/registration-confirmation',
  authentication = '/authentication',
  requestPasswordReset = '/request-password-reset',
  confirmPasswordReset = '/confirm-password-reset',
  deauthentication = '/deauthentication',
  loadCurrentAccount = '/account',
  requestAccountEmailChange = '/account/request-change-email',
  confirmAccountEmailChange = '/account/confirm-change-email',
  requestAccountPlanChange = '/account/request-plan-change',
  deleteAccountWithPassword = '/account/delete',
  requestAccountPasswordChange = '/account/request-change-password',
  deliveryReports = '/delivery-reports',
  checkFeedUrl = '/check-feed-url',
  stripeKeys = '/stripe-keys',
  stripeData = '/stripe-data',
  storeStripeCardDescription = '/store-stripe-card-description',
  accountSupportProduct = '/account-support-product',
}

export function getFullApiPath(path: ApiPath, params: Record<string, string> = {}): string {
  const queryParams = isEmptyObject(params) ? '' : '?' + new URLSearchParams(params).toString();

  return si`${apiBasePath}${path}${queryParams}`;
}
