import { ApiPath } from '../domain/api-path';
import { AddNewFeedRequestData, AddNewFeedResponseData, defaultExcerptWordCount } from '../domain/feed';
import { FeedManageParams, PagePath, makePagePathWithParams } from '../domain/page-path';
import { isAppError, isInputError, isSuccess } from '../shared/api-response';
import { Result, asyncAttempt, isErr } from '../shared/lang';
import {
  BreadcrumbsUiElements,
  breadcrumbsUiElements,
  displayBreadcrumbs,
  feedListBreadcrumbsLink,
} from './breadcrumbs';
import {
  ApiResponseUiElements,
  HttpMethod,
  apiResponseUiElements,
  clearValidationErrors,
  displayApiResponse,
  displayCommunicationError,
  displayInitError,
  displayValidationError,
  isAuthenticated,
  navigateTo,
  onSubmit,
  requireUiElements,
  sendApiRequest,
} from './shared';
import {
  UiFeedFormFields,
  makeEmailBodySpecFromFromFields,
  makeEmailSubjectSpecFromFromFields,
  uiFeedFormFields,
} from './feed-form-shared';

async function main() {
  if (!isAuthenticated()) {
    location.href = PagePath.userAuthentication;
    return;
  }

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

  initDefaultExcerptWordCount(uiElements.emailBodyExcerptWordCount, defaultExcerptWordCount);
  bindSubmitButton(uiElements);
  bindBlogFeedUrlField(uiElements);
}

function bindBlogFeedUrlField(uiElements: RequiredUiElements) {
  uiElements; // TODO: remove
  // TODO Maybe:
  // - oninput: check if it’s a valid URL, and try to ApiPath.checkFeedUrl
}

function initDefaultExcerptWordCount(filed: HTMLInputElement, count: number) {
  filed.value = count.toString();
}

function bindSubmitButton(uiElements: RequiredUiElements) {
  onSubmit(uiElements.submitButton, async (event: Event) => {
    event.preventDefault();
    clearValidationErrors(uiElements);

    const requestData = makeAddNewFeedRequestData(uiElements);

    if (isErr(requestData)) {
      displayValidationError(requestData, uiElements);
      return;
    }

    const response = await asyncAttempt(() =>
      sendApiRequest<AddNewFeedResponseData>(ApiPath.addNewFeed, HttpMethod.POST, requestData)
    );

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

function makeAddNewFeedRequestData(formFields: UiFeedFormFields): Result<AddNewFeedRequestData> {
  const emailBodySpec = makeEmailBodySpecFromFromFields(formFields);

  if (isErr(emailBodySpec)) {
    return emailBodySpec;
  }

  const emailSubjectSpec = makeEmailSubjectSpecFromFromFields(formFields);

  if (isErr(emailSubjectSpec)) {
    return emailSubjectSpec;
  }

  const requestData: AddNewFeedRequestData = {
    displayName: formFields.displayName.value,
    id: formFields.id.value,
    url: formFields.url.value,
    replyTo: formFields.replyTo.value,
    emailBodySpec,
    emailSubjectSpec,
  };

  return requestData;
}

interface RequiredUiElements extends UiFeedFormFields, ApiResponseUiElements, BreadcrumbsUiElements {
  submitButton: HTMLButtonElement;
}

typeof window !== 'undefined' && main();
