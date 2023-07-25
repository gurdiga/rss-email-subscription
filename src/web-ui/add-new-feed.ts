import { ApiPath } from '../domain/api-path';
import { AddNewFeedRequestData, AddNewFeedResponseData, defaultExcerptWordCount } from '../domain/feed';
import { FeedManageParams, PagePath, makePagePathWithParams } from '../domain/page-path';
import { isAppError, isInputError, isSuccess } from '../shared/api-response';
import { asyncAttempt, isErr } from '../shared/lang';
import {
  BreadcrumbsUiElements,
  breadcrumbsUiElements,
  displayBreadcrumbs,
  feedListBreadcrumbsLink,
} from './breadcrumbs';
import {
  ApiResponseUiElements,
  HttpMethod,
  UiFeedFormFields,
  apiResponseUiElements,
  clearValidationErrors,
  displayApiResponse,
  displayCommunicationError,
  displayInitError,
  displayValidationError,
  makeEmailBodySpecFromFromFields,
  navigateTo,
  onSubmit,
  requireUiElements,
  sendApiRequest,
  uiFeedFormFields,
} from './shared';

async function main() {
  const uiElements = requireUiElements<RequiredUiElements>({
    ...uiFeedFormFields,
    ...breadcrumbsUiElements,
    ...apiResponseUiElements,
    submitButton: '#submit-button',
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

  uiElements.emailBodyExcerptWordCount.value = defaultExcerptWordCount.toString();

  onSubmit(uiElements.submitButton, async (event: Event) => {
    event.preventDefault();
    clearValidationErrors(uiElements);

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
        const nextPageParams: FeedManageParams = { id: response.responseData?.feedId!, idChanged: 'false' };
        const nextPage = makePagePathWithParams(PagePath.feedManage, nextPageParams);

        navigateTo(nextPage);
      }, 1000);
    }
  });
}

async function submitForm(formFields: UiFeedFormFields) {
  const emailBodySpec = makeEmailBodySpecFromFromFields(formFields);

  if (isErr(emailBodySpec)) {
    return emailBodySpec;
  }

  const request: AddNewFeedRequestData = {
    displayName: formFields.displayName.value,
    id: formFields.id.value,
    url: formFields.url.value,
    replyTo: formFields.replyTo.value,
    emailBodySpec,
  };

  return await asyncAttempt(() => sendApiRequest<AddNewFeedResponseData>(ApiPath.addNewFeed, HttpMethod.POST, request));
}

interface RequiredUiElements extends UiFeedFormFields, ApiResponseUiElements, BreadcrumbsUiElements {
  submitButton: HTMLButtonElement;
}

typeof window !== 'undefined' && main();
