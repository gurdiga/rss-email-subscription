import { AddNewFeedRequestData, AddNewFeedResponseData } from '../domain/feed';
import { makePagePathWithParams, PagePath } from '../domain/page-path';
import { isAppError, isInputError, isSuccess } from '../shared/api-response';
import { asyncAttempt, isErr } from '../shared/lang';
import {
  breadcrumbsUiElements,
  BreadcrumbsUiElements,
  displayBreadcrumbs,
  feedListBreadcrumbsLink,
} from './breadcrumbs';
import {
  ApiResponseUiElements,
  clearValidationErrors,
  displayApiResponse,
  displayCommunicationError,
  displayInitError,
  displayValidationError,
  HttpMethod,
  navigateTo,
  preventDoubleClick,
  requireUiElements,
  sendApiRequest,
  uiFeedFormFields,
  UiFeedFormFields,
} from './shared';

async function main() {
  const uiElements = requireUiElements<RequiredUiElements>({
    ...uiFeedFormFields,
    ...breadcrumbsUiElements,
    submitButton: '#submit-button',
    apiResponseMessage: '#api-response-message',
  });

  if (isErr(uiElements)) {
    displayInitError(uiElements.reason);
    return;
  }

  displayBreadcrumbs(uiElements, [
    // prettier: keep these stacked
    feedListBreadcrumbsLink,
    { label: uiElements.pageTitle.textContent! },
  ]);

  uiElements.submitButton.addEventListener('click', async (event: Event) => {
    event.preventDefault();
    clearValidationErrors(uiElements);

    preventDoubleClick(uiElements.submitButton, async () => {
      const response = await submitForm(uiElements);

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

async function submitForm(formFields: UiFeedFormFields) {
  const makeFeedRequest: AddNewFeedRequestData = {
    displayName: formFields.displayName.value,
    id: formFields.id.value,
    url: formFields.url.value,
    replyTo: formFields.replyTo.value,
  };

  return await asyncAttempt(() =>
    sendApiRequest<AddNewFeedResponseData>('/feeds/add-new-feed', HttpMethod.POST, makeFeedRequest)
  );
}

interface RequiredUiElements extends UiFeedFormFields, ApiResponseUiElements, BreadcrumbsUiElements {
  submitButton: HTMLButtonElement;
}

globalThis.window && main();
