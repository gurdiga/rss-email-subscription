import { DeleteEmailsRequest, DeleteEmailsResponseData, LoadEmailsResponseData } from '../domain/feed';
import { FeedId, makeFeedId } from '../domain/feed-id';
import { isAppError, isInputError } from '../shared/api-response';
import { isEmpty } from '../shared/array-utils';
import { asyncAttempt, isErr, makeErr, Result } from '../shared/lang';
import { si } from '../shared/string-utils';
import { createElement } from './dom-isolation';
import { displayApiResponse, displayCommunicationError, displayInitError, HttpMethod } from './shared';
import { requireQueryParams, requireUiElements, sendApiRequest, unhideElement } from './shared';

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
  bindDeleteSelectedButton(uiElements, feedId);
  bindAddEmailsButton(uiElements, feedId);
}

function bindAddEmailsButton(uiElements: RequiredUiElements, feedId: FeedId): void {
  const { addEmailsButton } = uiElements;

  addEmailsButton.addEventListener('click', () => {});
}

function bindDeleteSelectedButton(uiElements: RequiredUiElements, feedId: FeedId): void {
  const { emailList, deleteSelectedButton, deleteSelectedApiResponseMessage } = uiElements;

  emailList.addEventListener('click', (event: Event) => {
    toggleItemSelection(event.target as HTMLLIElement);
    maybeEnableButton(deleteSelectedButton, emailList);
  });

  deleteSelectedButton.addEventListener('click', async () => {
    if (!confirm('Delete the selected emails?')) {
      return;
    }

    const selectedEmails = [...emailList.querySelectorAll('.list-group-item.active')].map((x) => x.textContent!);
    const response = await sendDeleteEmailsRequest(selectedEmails, feedId);

    if (isErr(response)) {
      displayCommunicationError(response.reason, deleteSelectedApiResponseMessage);
      return;
    }

    if (isAppError(response) || isInputError(response)) {
      displayApiResponse(response, deleteSelectedApiResponseMessage);
      return;
    }

    const { currentEmails } = response.responseData!;
    const initialVerticalScrollPosition = emailList.scrollTop;

    fillEmailList(uiElements, currentEmails);
    emailList.scrollTop = initialVerticalScrollPosition;
  });
}

async function sendDeleteEmailsRequest(emails: string[], feedId: FeedId) {
  const request: DeleteEmailsRequest = {
    emailsToDeleteJoinedByNewLines: emails.join('\n'),
  };

  return await asyncAttempt(() =>
    sendApiRequest<DeleteEmailsResponseData>(si`/feeds/${feedId.value}/delete-subscribers`, HttpMethod.POST, request)
  );
}

function maybeEnableButton(button: HTMLButtonElement, emailList: HTMLUListElement): void {
  button.disabled = !emailList.querySelector('.list-group-item.active');
}

function toggleItemSelection(item: HTMLLIElement) {
  item.classList.toggle('active');
}

function fillUi(uiElements: RequiredUiElements, data: LoadEmailsResponseData): void {
  fillFeedName(uiElements, data.displayName);
  fillEmailList(uiElements, data.emails);

  unhideElement(uiElements.feedNameContainer);
  unhideElement(uiElements.forms);
}

function fillFeedName(uiElements: RequiredUiElements, displayName: string): void {
  uiElements.feedName.textContent = displayName;
}

function fillEmailList(uiElements: RequiredUiElements, emails: string[]): void {
  const items = emails.map((text) => createElement('li', text, { class: 'list-group-item' }));
  const noEmails = isEmpty(emails);

  if (noEmails) {
    const noEmailsItem = createElement('li', 'No emails yet. 🤷🏻‍♂️ — Add some below.', {
      class: 'list-group-item disabled',
      'aria-disabled': 'true',
    });

    items.push(noEmailsItem);
  }

  uiElements.emailList.replaceChildren(...items);
  uiElements.deleteSelectedButton.toggleAttribute('hidden', noEmails);
  uiElements.emailListCounter.textContent = emails.length.toString();
}

async function loadFeedSubscribersData<T = LoadEmailsResponseData>(feedId: FeedId): Promise<Result<T>> {
  const response = await asyncAttempt(() => sendApiRequest<T>(si`/feeds/${feedId.value}/subscribers`));

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
