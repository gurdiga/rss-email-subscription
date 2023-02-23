import { LoadFeedSubscribersResponseData } from '../domain/feed';
import { FeedId, makeFeedId } from '../domain/feed-id';
import { isAppError, isInputError } from '../shared/api-response';
import { isEmpty, sortBy } from '../shared/array-utils';
import { asyncAttempt, isErr, makeErr, Result } from '../shared/lang';
import { si } from '../shared/string-utils';
import { createElement } from './dom-isolation';
import { displayInitError, requireQueryParams } from './shared';
import { requireUiElements, sendApiRequest, unhideElement } from './shared';

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
    spinner: '#spinner',
    feedNameContainer: '#feed-name-container',
    feedName: '#feed-name',
    forms: '#forms',
    emailList: '#email-list',
    emailListCounter: '#email-list-counter',
    deleteSelectedButton: '#delete-selected-button',
    deleteSelectedApiResponseMessage: '#delete-selected-api-response-message',
    emailsToAddField: '#emails-to-add-field',
    addEmailsButton: '#add-emails-button',
    addEmailsApiResponseMessage: '#add-emails-api-response-message',
  });

  if (isErr(uiElements)) {
    displayInitError(uiElements.reason);
    return;
  }

  const data = await loadFeedSubscribersData(feedId);

  uiElements.spinner.remove();

  if (isErr(data)) {
    displayInitError(data.reason);
    return;
  }

  fillUi(uiElements, data);
  handleDeleteSelectedButton(uiElements, feedId);

  // TODO: Handle buttons
}

function handleDeleteSelectedButton(uiElements: RequiredUiElements, _feedId: FeedId): void {
  const { emailList, deleteSelectedButton } = uiElements;

  emailList.addEventListener('click', (event: Event) => {
    toggleSelection(event);

    const anyItemSelected = !!emailList.querySelector('.list-group-item.active');

    enableIf(deleteSelectedButton, anyItemSelected);
  });

  deleteSelectedButton.addEventListener('click', () => {
    // TODO: sendDeleteSelectedRequest
  });
}

function enableIf(element: { disabled: boolean }, enabled: boolean): void {
  element.disabled = !enabled;
}

function toggleSelection(event: Event) {
  // Tap to select/unselect.
  const option = event.target as HTMLLIElement;

  option.classList.toggle('active');
}

function fillUi(uiElements: RequiredUiElements, data: LoadFeedSubscribersResponseData): void {
  fillFeedName(uiElements, data.displayName);
  fillEmailList(uiElements, data.emails);

  unhideElement(uiElements.feedNameContainer);
  unhideElement(uiElements.forms);
}

function fillFeedName(uiElements: RequiredUiElements, displayName: string): void {
  uiElements.feedName.textContent = displayName;
}

function fillEmailList(uiElements: RequiredUiElements, emails: string[]): void {
  if (!isEmpty(emails)) {
    const byDomainAndThenByLocalPart = sortBy((x: string) => {
      const [localPart, domain] = x.split('@');
      return [domain, localPart].join('');
    });

    const options = [...emails]
      .sort(byDomainAndThenByLocalPart)
      .map((x) => createElement('li', x, { class: 'list-group-item' }));

    uiElements.emailList.replaceChildren(...options);
  }

  uiElements.emailListCounter.textContent = emails.length.toString();
}

async function loadFeedSubscribersData<T = LoadFeedSubscribersResponseData>(feedId: FeedId): Promise<Result<T>> {
  const response = await asyncAttempt(() => sendApiRequest<T>(si`/feeds/${feedId.value}/emails`));

  if (isErr(response)) {
    return makeErr('Failed to load feed subscribers');
  }

  if (isAppError(response)) {
    return makeErr(si`Application error when loading feed subscribers: ${response.message}`);
  }

  if (isInputError(response)) {
    return makeErr('Input error when loading feed subscribers');
  }

  return response.responseData!;
}

interface UpdateSubscribersRequest {
  // TODO
}

export type UpdateSubscribersRequestData = Record<keyof UpdateSubscribersRequest, string>;

interface RequiredUiElements {
  spinner: HTMLElement;
  feedNameContainer: HTMLElement;
  feedName: HTMLElement;
  forms: HTMLElement;
  emailList: HTMLUListElement;
  emailListCounter: HTMLElement;
  deleteSelectedButton: HTMLButtonElement;
  deleteSelectedApiResponseMessage: HTMLElement;
  emailsToAddField: HTMLTextAreaElement;
  addEmailsButton: HTMLButtonElement;
  addEmailsApiResponseMessage: HTMLElement;
}

interface RequiredParams {
  id: string;
}

globalThis.window && main();
