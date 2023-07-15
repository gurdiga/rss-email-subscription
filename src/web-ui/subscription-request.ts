import { ApiPath } from '../domain/api-path';
import { LoadFeedDisplayNameResponseData } from '../domain/feed';
import { isAppError, isInputError, isSuccess } from '../shared/api-response';
import { Result, asyncAttempt, exhaustivenessCheck, isErr, makeErr } from '../shared/lang';
import { si } from '../shared/string-utils';
import {
  ApiResponseUiElements,
  HttpMethod,
  SpinnerUiElements,
  apiResponseUiElements,
  clearValidationErrors,
  displayApiResponse,
  displayCommunicationError,
  displayInitError,
  displayValidationError,
  hideElement,
  onSubmit,
  requireQueryParams,
  requireUiElements,
  sendApiRequest,
  spinnerUiElements,
  unhideElement,
} from './shared';

async function main() {
  const queryParams = requireQueryParams<RequiredParams>({
    feedId: 'feedId',
  });

  if (isErr(queryParams)) {
    displayInitError('Invalid subscription link');
    return;
  }

  const uiElements = requireUiElements<RequiredUiElements>({
    ...apiResponseUiElements,
    ...spinnerUiElements,
    ctaTextFeedName: '#cta-text-feed-name',
    form: '#form',
    emailField: '#email-field',
    submitButton: '#submit-button',
  });

  if (isErr(uiElements)) {
    displayInitError(uiElements.reason);
    return;
  }

  const response = await loadFeedDisplayName(queryParams.feedId);

  hideElement(uiElements.spinner);
  unhideElement(uiElements.form);

  if (isErr(response)) {
    return;
  }

  uiElements.ctaTextFeedName.textContent = response.displayName;
  uiElements.emailField.focus();

  initForm(uiElements, queryParams.feedId);
}

async function loadFeedDisplayName<T = LoadFeedDisplayNameResponseData>(feedId: string): Promise<Result<T>> {
  const response = await asyncAttempt(() => sendApiRequest<T>(ApiPath.loadFeedDisplayName, HttpMethod.GET, { feedId }));

  if (isErr(response)) {
    return makeErr(si`Failed to GET ${ApiPath.loadFeedDisplayName}`);
  }

  if (isAppError(response)) {
    return makeErr(response.message);
  }

  if (isInputError(response)) {
    return makeErr('Input error when loading the feed display name');
  }

  return response.responseData!; // TODO: Avoid banging
}

function initForm(uiElements: RequiredUiElements, feedId: string): void {
  const { form, submitButton, emailField, apiResponseMessage } = uiElements;

  onSubmit(submitButton, async (event: Event) => {
    event.preventDefault();
    clearValidationErrors(uiElements);
    hideElement(apiResponseMessage);

    const request = {
      feedId: feedId,
      email: emailField.value,
      source: location.href,
    };
    const response = await asyncAttempt(() => sendApiRequest(ApiPath.subscription, HttpMethod.POST, request));

    if (isErr(response)) {
      displayCommunicationError(response, apiResponseMessage);
      return;
    }

    if (isInputError(response)) {
      displayValidationError(response, { email: uiElements.emailField });
      return;
    }

    if (isAppError(response)) {
      displayApiResponse(response, apiResponseMessage);
      return;
    }

    if (isSuccess(response)) {
      displayApiResponse(response, apiResponseMessage);
      hideElement(form);
      return;
    }

    exhaustivenessCheck(response);
  });
}

interface RequiredParams {
  feedId: string;
}

interface RequiredUiElements extends ApiResponseUiElements, SpinnerUiElements {
  ctaTextFeedName: HTMLElement;
  form: HTMLFormElement;
  emailField: HTMLInputElement;
  submitButton: HTMLButtonElement;
}

typeof window !== 'undefined' && main();
