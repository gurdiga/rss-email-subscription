import { ApiPath } from '../domain/api-path';
import { CheckFeedUrlRequestData, CheckFeedUrlResponseData } from '../domain/feed';
import { isAppError, isInputError, isSuccess } from '../shared/api-response';
import { asyncAttempt, isErr } from '../shared/lang';
import { si } from '../shared/string-utils';
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
  clearInitError,
  clearValidationErrors,
  displayApiResponse,
  displayInitError,
  displayValidationError,
  onSubmit,
  reportAppError,
  reportUnexpectedEmptyResponseData,
  requireUiElements,
  sendApiRequest,
  unhideElement,
} from './shared';

async function main() {
  const uiElements = requireUiElements<RequiredUiElements>({
    ...breadcrumbsUiElements,
    ...apiResponseUiElements,
    blogUrlField: '#blog-url',
    rssUrlElement: '#rss-url',
    blogTitleContainer: '#blog-title-container',
    blogTitleField: '#blog-title',
    feedCheckApiErrorMessage: '#feed-check-api-error-message',
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

  uiElements.blogUrlField.focus();

  handleSubmit(uiElements);
}

async function handleSubmit(uiElements: RequiredUiElements): Promise<void> {
  const { blogUrlField, rssUrlElement, feedCheckApiErrorMessage, submitButton } = uiElements;
  const { blogTitleField, blogTitleContainer } = uiElements;

  onSubmit(submitButton, async (event) => {
    event.preventDefault();

    clearValidationErrors({ blogUrlField });
    clearInitError();

    const requestData: CheckFeedUrlRequestData = {
      blogUrl: blogUrlField.value,
    };
    const path = ApiPath.checkFeedUrl;
    const response = await asyncAttempt(() =>
      sendApiRequest<CheckFeedUrlResponseData>(path, HttpMethod.POST, requestData)
    );

    if (isErr(response)) {
      displayInitError(response.reason);
      return;
    }

    if (isAppError(response)) {
      displayApiResponse(response, feedCheckApiErrorMessage);
      return;
    }

    if (isInputError(response)) {
      const responseFieldName: keyof typeof requestData = 'blogUrl';
      displayValidationError(response, { [responseFieldName]: blogUrlField });
      return;
    }

    if (!isSuccess(response)) {
      reportAppError(si`Unhandled response type: ${JSON.stringify(response)}`);
    }
    if (!response.responseData) {
      reportUnexpectedEmptyResponseData(path);
      return;
    }

    const { feedUrl, blogTitle } = response.responseData;

    rssUrlElement.textContent = feedUrl;

    unhideElement(rssUrlElement);
    unhideElement(blogTitleContainer);

    blogTitleField.value = blogTitle;
    blogTitleField.select();
    blogTitleField.focus();

    return;
  });
}

interface RequiredUiElements extends ApiResponseUiElements, BreadcrumbsUiElements {
  blogUrlField: HTMLInputElement;
  blogTitleContainer: HTMLElement;
  blogTitleField: HTMLInputElement;
  rssUrlElement: HTMLElement;
  feedCheckApiErrorMessage: HTMLDivElement;
  submitButton: HTMLButtonElement;
}

typeof window !== 'undefined' && main();
