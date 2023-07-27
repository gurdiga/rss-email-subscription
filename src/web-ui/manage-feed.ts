import { ApiPath } from '../domain/api-path';
import {
  DeleteFeedRequestData,
  FeedManageScreenRequestData,
  FeedManageScreenResponse,
  FeedStatus,
  ShowSampleEmailRequestData,
  UiFeed,
} from '../domain/feed';
import { FeedId, makeFeedId } from '../domain/feed-id';
import {
  DeliveryReportsParams,
  FeedEditParams,
  FeedSubscribeFormParams,
  ManageFeedSubscribersParams,
  PagePath,
  makePagePathWithParams,
} from '../domain/page-path';
import { isAppError, isInputError, isSuccess, makeAppError } from '../shared/api-response';
import { asyncAttempt, isErr, makeErr } from '../shared/lang';
import { si } from '../shared/string-utils';
import {
  BreadcrumbsUiElements,
  breadcrumbsUiElements,
  displayBreadcrumbs,
  feedListBreadcrumbsLink,
} from './breadcrumbs';
import { createElement } from './dom-isolation';
import {
  ApiResponseUiElements,
  HttpMethod,
  SpinnerUiElements,
  apiResponseUiElements,
  displayApiResponse,
  displayInitError,
  navigateTo,
  onClick,
  preventDoubleClick,
  reportAppError,
  requireQueryParams,
  requireUiElements,
  scrollIntoView,
  sendApiRequest,
  spinnerUiElements,
  unhideElement,
} from './shared';

async function main() {
  const queryStringParams = requireQueryParams<RequiredParams>({
    id: 'id',
    idChanged: 'idChanged',
  });

  if (isErr(queryStringParams)) {
    displayInitError(queryStringParams.reason);
    return;
  }

  const feedId = makeFeedId(queryStringParams.id);

  if (isErr(feedId)) {
    displayInitError(si`Invalid feed ID: ${feedId.reason}`);
    return;
  }

  const uiElements = requireUiElements<RequiredUiElements>({
    ...breadcrumbsUiElements,
    ...spinnerUiElements,
    ...apiResponseUiElements,
    feedAttributeList: '#feed-attribute-list',
    feedActions: '#feed-actions',
    editLink: '#edit-link',
    subscribeFormLink: '#subscribe-form-link',
    deliveryReportsLink: '#delivery-reports-link',
    deleteButton: '#delete-button',
    showSampleEmailButton: '#show-sample-email-button',
    idChangedMessage: '#id-changed-message',
    newFeedId: '#new-feed-id',
  });

  if (isErr(uiElements)) {
    displayInitError(uiElements.reason);
    return;
  }

  const response = await loadData(feedId);

  uiElements.spinner.remove();

  if (isErr(response)) {
    displayInitError(response.reason);
    return;
  }

  if (queryStringParams.idChanged === 'true') {
    uiElements.newFeedId.textContent = queryStringParams.id;
    unhideElement(uiElements.idChangedMessage);
  }

  const { displayName } = response;

  unhideElement(uiElements.feedActions);
  displayFeedAttributeList(response, uiElements, feedId);
  bindDeleteButton(uiElements, displayName, feedId);
  bindShowSampleEmailButton(uiElements, feedId);
  displayBreadcrumbs(uiElements, [
    // prettier: keep these stacked
    feedListBreadcrumbsLink,
    { label: displayName },
  ]);
}

function bindShowSampleEmailButton(uiElements: RequiredUiElements, feedId: FeedId): void {
  const { showSampleEmailButton } = uiElements;

  onClick(showSampleEmailButton, () => {
    preventDoubleClick(showSampleEmailButton, async () => {
      const response = await sendShowSampleEmailRequest(feedId);

      displayApiResponse(response, uiElements.apiResponseMessage);
      scrollIntoView(uiElements.apiResponseMessage);
    });
  });
}

async function sendShowSampleEmailRequest(feedId: FeedId) {
  const data: ShowSampleEmailRequestData = { feedId: feedId.value };
  const result = await asyncAttempt(() => sendApiRequest<string>(ApiPath.showSampleEmail, HttpMethod.POST, data));

  if (isErr(result)) {
    return makeAppError('Failed to connect to server, please try again in a few moments');
  }

  return result;
}

export async function loadData(feedId: FeedId) {
  const request: FeedManageScreenRequestData = { feedId: feedId.value };
  const response = await asyncAttempt(() =>
    sendApiRequest<FeedManageScreenResponse>(ApiPath.manageFeed, HttpMethod.GET, request)
  );

  if (isErr(response)) {
    reportAppError(response.reason);
    return makeErr('Failed to load the feed');
  }

  if (isAppError(response)) {
    return makeErr(response.message);
  }

  if (isInputError(response)) {
    return makeErr('Input error when loading the feed');
  }

  if (!response.responseData) {
    return makeErr('Unexpected empty server response');
  }

  return response.responseData;
}

function bindDeleteButton(uiElements: RequiredUiElements, feedName: string, feedId: FeedId): void {
  const { deleteButton } = uiElements;

  onClick(deleteButton, async () => {
    if (!confirm(si`Do you really want to delete the feed “${feedName}”?`)) {
      return;
    }

    const response = await sendDeleteFeedRequest(feedId);

    displayApiResponse(response, uiElements.apiResponseMessage);

    if (isSuccess(response)) {
      navigateTo(PagePath.feedList, 2000);
    }
  });
}

async function sendDeleteFeedRequest(feedId: FeedId) {
  const data: DeleteFeedRequestData = { feedId: feedId.value };

  const result = await asyncAttempt(() => sendApiRequest(ApiPath.deleteFeed, HttpMethod.POST, data));

  if (isErr(result)) {
    return makeAppError('Failed to connect to server, please try again in a few moments');
  }

  return result;
}

function displayFeedAttributeList(
  response: FeedManageScreenResponse,
  uiElements: RequiredUiElements,
  feedId: FeedId
): void {
  const { feedAttributeList, editLink, subscribeFormLink, deliveryReportsLink } = uiElements;
  const uiData = makeUiData(response, feedId);

  const feedAttributeElements = uiData.feedAttributes.flatMap(makeFeedAttributeElement);

  const feedStatusElements = makeStatusField(response.status);
  const subscriberCountElements = makeSubscriberCountField(response.subscriberCount, uiData.manageSubscribersLinkHref);

  feedAttributeList.append(...feedAttributeElements, ...feedStatusElements, ...subscriberCountElements);
  unhideElement(feedAttributeList);

  editLink.href = uiData.editLinkHref;
  subscribeFormLink.href = uiData.subscribeFormLink;
  deliveryReportsLink.href = uiData.deliveryReportsLinkHref;
}

export function makeStatusField(status: FeedStatus, createElementFn = createElement): HTMLElement[] {
  const dtElement = createElementFn('dt', 'Status:', { class: 'res-feed-attribute-label' });
  const ddElement = createElementFn('dd', status, { class: 'res-feed-attribute-value' });

  if (status === FeedStatus.AwaitingReview) {
    const message =
      'It should take less than 24 hours to review and approve your feed.' +
      ' We’ll send you a notification at the account email.';

    const approvalInfo = createElementFn('p', message, {
      class: 'form-text m-0 text-success',
    });

    const infoIcon = createElementFn('i', '', { class: 'fa-solid fa-circle-info me-1 ' });

    approvalInfo.prepend(infoIcon);
    ddElement.append(approvalInfo);
  } else if (status === FeedStatus.Approved) {
    const successIcon = createElementFn('i', '', { class: 'fa-solid fa-circle-check ms-1 text-success' });
    ddElement.append(successIcon);
  } else if (status === FeedStatus.Rejected) {
    const failIcon = createElementFn('i', '', { class: 'fa-solid fa-circle-xmark ms-1 text-danger' });
    ddElement.append(failIcon);
  }

  return [dtElement, ddElement];
}

function makeSubscriberCountField(subscriberCount: number, href: string): [HTMLElement, HTMLElement] {
  const dtElement = createElement('dt', 'Subscriber count:', { class: 'res-feed-attribute-label' });
  const ddElement = createElement('dd', subscriberCount.toString(), { class: 'res-feed-attribute-value' });

  const linkText = subscriberCount === 0 ? 'Add subscribers' : 'Manage subscribers';
  const manageSubscribersLink = createElement('a', linkText, { href });
  const separator = createElement('hr', '', { class: 'res-subscriber-count-separator' });

  ddElement.append(separator, manageSubscribersLink);

  return [dtElement, ddElement];
}

function makeFeedAttributeElement(feedAttribute: FeedAttribute): [HTMLElement, HTMLElement] {
  const dtElement = createElement('dt', feedAttribute.label, { class: 'res-feed-attribute-label' });
  const ddElement = createElement('dd', feedAttribute.value, { class: 'res-feed-attribute-value' });

  return [dtElement, ddElement];
}

export interface UiData {
  feedAttributes: FeedAttribute[];
  editLinkHref: string;
  subscribeFormLink: string;
  deliveryReportsLinkHref: string;
  manageSubscribersLinkHref: string;
}

interface FeedAttribute {
  name: keyof UiFeed;
  label: string;
  value: string;
}

export function makeUiData(uiFeed: UiFeed, feedId: FeedId): UiData {
  const feedAttributes: FeedAttribute[] = [
    { label: 'Blog feed URL:', value: uiFeed.url, name: 'url' },
    { label: 'Name:', value: uiFeed.displayName, name: 'displayName' },
    { label: 'Email address:', value: uiFeed.email, name: 'email' },
    { label: 'Email body:', value: uiFeed.emailBodySpec, name: 'emailBodySpec' },
    { label: 'Reply-to:', value: uiFeed.replyTo, name: 'replyTo' },
  ];

  const editLinkHref = makePagePathWithParams<FeedEditParams>(PagePath.feedEdit, { id: feedId.value });
  const subscribeFormLink = makePagePathWithParams<FeedSubscribeFormParams>(PagePath.feedSubscribeForm, {
    id: feedId.value,
    displayName: uiFeed.displayName,
  });
  const deliveryRepoersLink = makePagePathWithParams<DeliveryReportsParams>(PagePath.deliveryReports, {
    id: feedId.value,
    displayName: uiFeed.displayName,
  });
  const manageSubscribersLinkHref = makePagePathWithParams<ManageFeedSubscribersParams>(
    PagePath.manageFeedSubscribers,
    { id: feedId.value }
  );

  return {
    feedAttributes,
    editLinkHref,
    subscribeFormLink,
    deliveryReportsLinkHref: deliveryRepoersLink,
    manageSubscribersLinkHref,
  };
}

interface RequiredUiElements extends BreadcrumbsUiElements, SpinnerUiElements, ApiResponseUiElements {
  feedAttributeList: HTMLElement;
  feedActions: HTMLElement;
  editLink: HTMLAnchorElement;
  subscribeFormLink: HTMLAnchorElement;
  deliveryReportsLink: HTMLAnchorElement;
  deleteButton: HTMLButtonElement;
  showSampleEmailButton: HTMLButtonElement;
  idChangedMessage: HTMLButtonElement;
  newFeedId: HTMLButtonElement;
}

interface RequiredParams {
  id: string;
  idChanged: string;
}

typeof window !== 'undefined' && main();
