import { LoadFeedSubscribersResponseData } from '../domain/feed';
import { FeedId, makeFeedId } from '../domain/feed-id';
import { isAppError, isInputError } from '../shared/api-response';
import { isEmpty } from '../shared/array-utils';
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
    toggleItemSelection(event);
    maybeEnableButton(deleteSelectedButton, emailList);
  });

  deleteSelectedButton.addEventListener('click', () => {
    // TODO: sendDeleteSelectedRequest
  });
}

function maybeEnableButton(button: HTMLButtonElement, emailList: HTMLUListElement): void {
  const noItemSelected = !emailList.querySelector('.list-group-item.active');

  button.disabled = noItemSelected;
}

function toggleItemSelection(event: Event) {
  const item = event.target as HTMLLIElement;

  item.classList.toggle('active');
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
  const hasEmails = !isEmpty(emails);

  if (hasEmails) {
    const items = emails.map(createItem);

    uiElements.emailList.replaceChildren(...items);
  }

  uiElements.deleteSelectedButton.toggleAttribute('hidden', !hasEmails);
  uiElements.emailListCounter.textContent = emails.length.toString();
}
function createItem(text: string) {
  return createElement('li', text, { class: 'list-group-item' });
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
