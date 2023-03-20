import { ApiPath } from '../domain/api-path';
import { FeedManageScreenResponse, FeedManageScreenRequestData, DeleteFeedRequestData, UiFeed } from '../domain/feed';
import { FeedId, makeFeedId } from '../domain/feed-id';
import {
  FeedEditParams,
  FeedSubscribeFormParams,
  makePagePathWithParams,
  ManageFeedSubscribersParams,
  PagePath,
} from '../domain/page-path';
import { isAppError, isInputError, isSuccess, Success } from '../shared/api-response';
import { asyncAttempt, isErr, makeErr, Result } from '../shared/lang';
import { si } from '../shared/string-utils';
import {
  BreadcrumbsUiElements,
  breadcrumbsUiElements,
  displayBreadcrumbs,
  feedListBreadcrumbsLink,
} from './breadcrumbs';
import { createElement } from './dom-isolation';
import {
  displayInitError,
  HttpMethod,
  navigateTo,
  onClick,
  requireQueryParams,
  requireUiElements,
  sendApiRequest,
  SpinnerUiElements,
  spinnerUiElements,
  unhideElement,
} from './shared';

async function main() {
  const queryStringParams = requireQueryParams<RequiredParams>({
    id: 'id',
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
    feedAttributeList: '#feed-attribute-list',
    feedActions: '#feed-actions',
    editLink: '#edit-link',
    subscribeFormLink: '#subscribe-form-link',
    deleteButton: '#delete-button',
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

  unhideElement(uiElements.feedActions);
  displayFeedAttributeList(response, uiElements, feedId);
  bindDeleteButton(uiElements.deleteButton, response.displayName, feedId);
  displayBreadcrumbs(uiElements, [
    // prettier: keep these stacked
    feedListBreadcrumbsLink,
    { label: response.displayName },
  ]);
}

export async function loadData<T = FeedManageScreenResponse>(feedId: FeedId): Promise<Result<T>> {
  const request: FeedManageScreenRequestData = { feedId: feedId.value };
  const response = await asyncAttempt(() => sendApiRequest<T>(ApiPath.feedManageScreen, HttpMethod.GET, request));

  if (isErr(response)) {
    return makeErr('Failed to load the feed');
  }

  if (isAppError(response)) {
    return makeErr(response.message);
  }

  if (isInputError(response)) {
    return makeErr('Input error when loading the feed');
  }

  return response.responseData!;
}

function bindDeleteButton(button: HTMLButtonElement, feedName: string, feedId: FeedId): void {
  onClick(button, async () => {
    if (!confirm(si`Do you really want to delete the feed “${feedName}”?`)) {
      return;
    }

    const result = await sendDeleteRequest(feedId);

    if (isErr(result)) {
      // TODO: Display the error
    }

    if (isSuccess(result)) {
      navigateTo(PagePath.feedList);
    }
  });
}

async function sendDeleteRequest(feedId: FeedId): Promise<Result<Success>> {
  const data: DeleteFeedRequestData = { feedId: feedId.value };
  const response = await asyncAttempt(() => sendApiRequest(ApiPath.deleteFeed, HttpMethod.POST, data));

  if (isErr(response)) {
    return makeErr('Failed to load the feed');
  }

  if (isAppError(response)) {
    return makeErr(si`Application error when loading the feed: ${response.message}`);
  }

  if (isInputError(response)) {
    return makeErr('Input error when loading the feed');
  }

  return response;
}

function displayFeedAttributeList(
  response: FeedManageScreenResponse,
  uiElements: RequiredUiElements,
  feedId: FeedId
): void {
  const { feedAttributeList, editLink, subscribeFormLink } = uiElements;
  const uiData = makeUiData(response, feedId);
  const feedAttributeElements = uiData.feedAttributes.flatMap((feedAttribute) => {
    const [dtElement, ddElement] = makeFeedAttributeElement(feedAttribute);

    if (feedAttribute.name === 'subscriberCount') {
      addManageSubscribersLink(ddElement, uiData.manageSubscribersLinkHref);
    }

    return [dtElement, ddElement];
  });

  feedAttributeList.append(...feedAttributeElements);
  unhideElement(feedAttributeList);

  editLink.href = uiData.editLinkHref;
  subscribeFormLink.href = uiData.subscribeFormLink;
}

function addManageSubscribersLink(ddElement: HTMLElement, href: string): void {
  const manageSubscribersLink = createElement('a', 'Manage subscribers', { href });
  const separator = createElement('span', '•', { class: 'res-subscriber-count-separator' });

  ddElement.append(separator, manageSubscribersLink);
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
    { label: 'Email:', value: uiFeed.email, name: 'email' },
    { label: 'Reply-to:', value: uiFeed.replyTo, name: 'replyTo' },
    { label: 'Status:', value: uiFeed.status, name: 'status' },
    { label: 'Subscriber count:', value: uiFeed.subscriberCount.toString(), name: 'subscriberCount' },
  ];

  const editLinkHref = makePagePathWithParams<FeedEditParams>(PagePath.feedEdit, { id: feedId.value });
  const subscribeFormLink = makePagePathWithParams<FeedSubscribeFormParams>(PagePath.feedSubscribeForm, {
    id: feedId.value,
    displayName: uiFeed.displayName,
  });
  const manageSubscribersLinkHref = makePagePathWithParams<ManageFeedSubscribersParams>(
    PagePath.manageFeedSubscribers,
    { id: feedId.value }
  );

  return { feedAttributes, editLinkHref, subscribeFormLink, manageSubscribersLinkHref };
}

interface RequiredUiElements extends BreadcrumbsUiElements, SpinnerUiElements {
  feedAttributeList: HTMLElement;
  feedActions: HTMLElement;
  editLink: HTMLAnchorElement;
  subscribeFormLink: HTMLAnchorElement;
  deleteButton: HTMLButtonElement;
}

interface RequiredParams {
  id: string;
}

globalThis.window && main();
