import { ApiPath } from '../domain/api-path';
import { EditFeedRequestData, EditFeedResponse, UiFeed } from '../domain/feed';
import { FeedId, makeFeedId } from '../domain/feed-id';
import { makePagePathWithParams, PagePath } from '../domain/page-path';
import { isAppError, isInputError, isSuccess } from '../shared/api-response';
import { asyncAttempt, isErr } from '../shared/lang';
import { si } from '../shared/string-utils';
import {
  BreadcrumbsUiElements,
  breadcrumbsUiElements,
  displayBreadcrumbs,
  feedListBreadcrumbsLink,
  makeFeedManageBreadcrumbsLink,
} from './breadcrumbs';
import {
  apiResponseUiElements,
  ApiResponseUiElements,
  clearValidationErrors,
  displayApiResponse,
  displayCommunicationError,
  displayInitError,
  displayValidationError,
  HttpMethod,
  loadUiFeed,
  navigateTo,
  onClick,
  preventDoubleClick,
  requireQueryParams,
  requireUiElements,
  sendApiRequest,
  SpinnerUiElements,
  spinnerUiElements,
  UiFeedFormFields,
  uiFeedFormFields,
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
    form: '#edit-form',
    ...uiFeedFormFields,
    ...breadcrumbsUiElements,
    ...spinnerUiElements,
    ...apiResponseUiElements,
    submitButton: '#submit-button',
  });

  if (isErr(uiElements)) {
    displayInitError(uiElements.reason);
    return;
  }

  const uiFeed = await loadUiFeed(feedId);

  uiElements.spinner.remove();

  if (isErr(uiFeed)) {
    displayInitError(uiFeed.reason);
    return;
  }

  fillForm(uiElements, uiFeed);
  unhideElement(uiElements.form);
  bindSubmitButton(uiElements, feedId);
  displayBreadcrumbs(uiElements, [
    feedListBreadcrumbsLink,
    makeFeedManageBreadcrumbsLink(uiFeed.displayName, feedId),
    { label: uiElements.pageTitle.textContent! },
  ]);
}

function bindSubmitButton(uiElements: RequiredUiElements, feedId: FeedId): void {
  onClick(uiElements.submitButton, async (event: Event) => {
    event.preventDefault();
    clearValidationErrors(uiElements);

    preventDoubleClick(uiElements.submitButton, async () => {
      const response = await submitForm(uiElements, feedId);

      if (isErr(response)) {
        displayCommunicationError(response, uiElements.apiResponseMessage);
        return;
      }

      if (isAppError(response)) {
        displayApiResponse(response, uiElements.apiResponseMessage);
        return;
      }

      if (isInputError(response)) {
        displayValidationError(response, uiElements);
        return;
      }

      if (isSuccess(response)) {
        displayApiResponse(response, uiElements.apiResponseMessage);

        setTimeout(() => {
          const nextPageParams = { id: response.responseData?.feedId! };
          const nextPage = makePagePathWithParams(PagePath.feedManage, nextPageParams);

          navigateTo(nextPage);
        }, 1000);
      }
    });
  });
}

function fillForm(uiElements: UiFeedFormFields, uiFeed: UiFeed) {
  uiElements.displayName.value = uiFeed.displayName;
  uiElements.url.value = uiFeed.url;
  uiElements.id.value = uiFeed.id;
  uiElements.replyTo.value = uiFeed.replyTo;
}

async function submitForm(formFields: UiFeedFormFields, initialId: FeedId) {
  const editFeedRequest: EditFeedRequestData = {
    displayName: formFields.displayName.value,
    id: formFields.id.value,
    initialId: initialId.value,
    url: formFields.url.value,
    replyTo: formFields.replyTo.value,
  };

  return await asyncAttempt(() => sendApiRequest<EditFeedResponse>(ApiPath.editFeed, HttpMethod.POST, editFeedRequest));
}

interface RequiredUiElements extends UiFeedFormFields, ApiResponseUiElements, BreadcrumbsUiElements, SpinnerUiElements {
  form: HTMLFormElement;
  submitButton: HTMLButtonElement;
}

interface RequiredParams {
  id: string;
}

globalThis.window && main();
