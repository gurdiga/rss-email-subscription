import { ApiPath } from '../domain/api-path';
import {
  AddEmailsRequest,
  AddEmailsResponse,
  DeleteEmailsRequest,
  DeleteEmailsResponse,
  LoadEmailsRequestData,
  LoadEmailsResponse,
} from '../domain/feed';
import { FeedId, makeFeedId } from '../domain/feed-id';
import { isAppError, isInputError } from '../shared/api-response';
import { isEmpty } from '../shared/array-utils';
import { asyncAttempt, isErr, makeErr, Result } from '../shared/lang';
import { si } from '../shared/string-utils';
import {
  breadcrumbsUiElements,
  BreadcrumbsUiElements,
  displayBreadcrumbs,
  makeFeedManageBreadcrumbsLink,
  feedListBreadcrumbsLink,
} from './breadcrumbs';
import { createElement } from './dom-isolation';
import {
  displayApiResponse,
  displayCommunicationError,
  displayInitError,
  HttpMethod,
  isDemoAccount,
  onClick,
  requireQueryParams,
  requireUiElements,
  sendApiRequest,
  spinnerUiElements,
  SpinnerUiElements,
  toggleElement,
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
    downloadLink: '#download-link',
    demoAccountNote: '#demo-account-note',
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
  setupDownloadLink(uiElements.downloadLink, feedId, data);
  displayBreadcrumbs(uiElements, [
    feedListBreadcrumbsLink,
    makeFeedManageBreadcrumbsLink(data.displayName, feedId),
    {
      label: uiElements.pageTitle.textContent!,
    },
  ]);

  toggleElement(isDemoAccount(), uiElements.demoAccountNote);
}

function setupDownloadLink(downloadLink: HTMLAnchorElement, feedId: FeedId, data: LoadEmailsResponse) {
  const fileName = si`${feedId.value}-subscribers.txt`;
  const fileContent = encodeURIComponent(data.emails.join('\n') + '\n');

  downloadLink.download = fileName;
  downloadLink.href = 'data:,' + fileContent;
}

function bindAddEmailsButton(uiElements: RequiredUiElements, feedId: FeedId): void {
  const { addEmailsButton, emailsToAddField, addEmailsApiResponseMessage, emailList } = uiElements;

  onClick(addEmailsButton, async () => {
    const response = await sendAddEmailsRequest(emailsToAddField.value, feedId);

    if (isErr(response)) {
      displayCommunicationError(response.reason, addEmailsApiResponseMessage);
      return;
    }

    if (isAppError(response) || isInputError(response)) {
      displayApiResponse(response, addEmailsApiResponseMessage);
      return;
    }

    const { newEmailsCount, currentEmails } = response.responseData!;
    const initialVerticalScrollPosition = emailList.scrollTop;

    fillEmailList(uiElements, currentEmails);
    emailList.scrollTop = initialVerticalScrollPosition;
    emailsToAddField.value = '';

    if (newEmailsCount === 0) {
      response.message = 'No new emails';
    }

    displayApiResponse(response, addEmailsApiResponseMessage);
  });
}

async function sendAddEmailsRequest(emailsOnePerLine: string, feedId: FeedId) {
  const request: AddEmailsRequest = {
    feedId: feedId.value,
    emailsOnePerLine,
  };

  return await asyncAttempt(() =>
    sendApiRequest<AddEmailsResponse>(ApiPath.addFeedSubscribers, HttpMethod.POST, request)
  );
}

function bindDeleteSelectedButton(uiElements: RequiredUiElements, feedId: FeedId): void {
  const { emailList, deleteSelectedButton, deleteSelectedApiResponseMessage } = uiElements;

  onClick(emailList, (event: Event) => {
    toggleItemSelection(event.target as HTMLLIElement);
    maybeEnableButton(deleteSelectedButton, emailList);
  });

  onClick(deleteSelectedButton, async () => {
    if (!confirm('Delete the selected emails?')) {
      return;
    }

    const response = await sendDeleteEmailsRequest(emailList, feedId);

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
    maybeEnableButton(deleteSelectedButton, emailList);
  });
}

async function sendDeleteEmailsRequest(emailList: HTMLUListElement, feedId: FeedId) {
  const selectedEmails = [...emailList.querySelectorAll('.list-group-item.active')].map((x) => x.textContent!);
  const request: DeleteEmailsRequest = {
    feedId: feedId.value,
    emailsToDeleteOnePerLine: selectedEmails.join('\n'),
  };

  return await asyncAttempt(() =>
    sendApiRequest<DeleteEmailsResponse>(ApiPath.deleteFeedSubscribers, HttpMethod.POST, request)
  );
}

function maybeEnableButton(button: HTMLButtonElement, emailList: HTMLUListElement): void {
  button.disabled = !emailList.querySelector('.list-group-item.active');
}

function toggleItemSelection(item: HTMLLIElement) {
  item.classList.toggle('active');
}

function fillUi(uiElements: RequiredUiElements, data: LoadEmailsResponse): void {
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

async function loadFeedSubscribersData<T = LoadEmailsResponse>(feedId: FeedId): Promise<Result<T>> {
  const request: LoadEmailsRequestData = { feedId: feedId.value };
  const response = await asyncAttempt(() => sendApiRequest<T>(ApiPath.loadFeedSubscribers, HttpMethod.GET, request));

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

interface RequiredUiElements extends BreadcrumbsUiElements, SpinnerUiElements {
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
  downloadLink: HTMLAnchorElement;
  demoAccountNote: HTMLElement;
}

interface RequiredParams {
  id: string;
}

typeof window !== 'undefined' && main();
