import { UiFeed } from '../domain/feed';
import { FeedId, makeFeedId } from '../domain/feed-id';
import { isAppError, isInputError } from '../shared/api-response';
import { asyncAttempt, isErr, makeErr, Result } from '../shared/lang';
import { makePagePathWithParams, PagePaths } from '../shared/page-paths';
import { si } from '../shared/string-utils';
import { createElement } from './dom-isolation';
import { displayInitError, HttpMethod, requireQueryParams, requireUiElements, sendApiRequest } from './shared';
import { unhideElement } from './shared';

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

  const uiElements = requireUiElements<UiElements>({
    spinner: '#spinner',
    feedAttributeList: '#feed-attribute-list',
    feedActions: '#feed-actions',
    editLink: '#edit-link',
  });

  if (isErr(uiElements)) {
    displayInitError(uiElements.reason);
    return;
  }

  const uiFeed = await loadFeed(queryStringParams.id);

  uiElements.spinner.remove();

  if (isErr(uiFeed)) {
    displayInitError(uiFeed.reason);
    return;
  }

  unhideElement(uiElements.feedActions);
  displayFeedAttributeList(uiFeed, uiElements, feedId);
}

async function loadFeed<T = UiFeed>(id: string): Promise<Result<T>> {
  const response = await asyncAttempt(() => sendApiRequest<T>(si`/feeds/${id}`, HttpMethod.GET));

  if (isErr(response)) {
    return makeErr('Failed to load the feed');
  }

  if (isAppError(response)) {
    return makeErr('Application error when loading the feed');
  }

  if (isInputError(response)) {
    return makeErr('Input error when loading the feed');
  }

  return response.responseData!;
}

function displayFeedAttributeList(uiFeed: UiFeed, uiElements: UiElements, feedId: FeedId): void {
  const { feedAttributeList, editLink } = uiElements;
  const uiData = makeUiData(uiFeed, feedId);
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
  manageSubscribersLinkHref: string;
}

interface FeedAttribute {
  name: keyof UiFeed;
  label: string;
  value: string;
}

export function makeUiData(uiFeed: UiFeed, feedId: FeedId): UiData {
  const feedAttributes: FeedAttribute[] = [
    { label: 'Name:', value: uiFeed.displayName, name: 'displayName' },
    { label: 'URL:', value: uiFeed.url, name: 'url' },
    { label: 'Email:', value: uiFeed.email, name: 'email' },
    { label: 'Reply-to:', value: uiFeed.replyTo, name: 'replyTo' },
    { label: 'Subscriber count:', value: uiFeed.subscriberCount.toString(), name: 'subscriberCount' },
    { label: 'Active:', value: uiFeed.isActive ? 'Yes' : 'No', name: 'isActive' },
  ];

  const editLinkHref = makePagePathWithParams(PagePaths.feedEdit, { id: feedId.value });
  const manageSubscribersLinkHref = makePagePathWithParams(PagePaths.manageFeedSubscribers, { id: feedId.value });

  return { feedAttributes, editLinkHref, manageSubscribersLinkHref };
}

interface UiElements {
  spinner: HTMLElement;
  feedAttributeList: HTMLElement;
  feedActions: HTMLElement;
  editLink: HTMLAnchorElement;
}

interface RequiredParams {
  id: string;
}

globalThis.window && main();
