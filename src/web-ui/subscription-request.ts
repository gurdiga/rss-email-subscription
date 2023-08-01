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
  reportAppError,
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
    invalidLinkMessage: '#invalid-link-message',
    applicationErrorMessage: '#application-error-message',
    ctaTextFeedName: '#cta-text-feed-name',
    form: '#form',
    emailField: '#email-field',
    submitButton: '#submit-button',
    emailAddress: '#email-address',
    successMessage: '#success-message',
  });

  if (isErr(uiElements)) {
    displayInitError(uiElements.reason);
    return;
  }

  const response = await loadFeedDisplayName(queryParams.feedId);

  hideElement(uiElements.spinner);

  if (isErr(response) && response.reason === 'Feed not found') {
    unhideElement(uiElements.invalidLinkMessage);
    return;
  }

  if (isErr(response)) {
    unhideElement(uiElements.applicationErrorMessage);
    return;
  }

  unhideElement(uiElements.form);
  uiElements.ctaTextFeedName.textContent = response.displayName;
  uiElements.emailField.focus();

  initForm(uiElements, queryParams.feedId);
}

async function loadFeedDisplayName<T = LoadFeedDisplayNameResponseData>(feedId: string): Promise<Result<T>> {
  const path = ApiPath.loadFeedDisplayName;
  const response = await asyncAttempt(() => sendApiRequest<T>(path, HttpMethod.GET, { feedId }));

  if (isErr(response)) {
    reportAppError(si`Failed to GET ${path}: ${response.reason}`);
    return makeErr(si`Failed to GET ${path}`);
  }

  if (isAppError(response) || isInputError(response)) {
    return makeErr(response.message);
  }

  return response.responseData!; // TODO: Avoid banging
}

function initForm(uiElements: RequiredUiElements, feedId: string): void {
  const { form, submitButton, emailField, apiResponseMessage, emailAddress, successMessage } = uiElements;

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
      emailAddress.textContent = uiElements.emailField.value;
      unhideElement(successMessage);
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
  invalidLinkMessage: HTMLElement;
  applicationErrorMessage: HTMLElement;
  ctaTextFeedName: HTMLElement;
  form: HTMLFormElement;
  emailField: HTMLInputElement;
  submitButton: HTMLButtonElement;
  emailAddress: HTMLElement;
  successMessage: HTMLElement;
}

typeof window !== 'undefined' && main();
