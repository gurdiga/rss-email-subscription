import { ApiPath } from '../domain/api-path';
import { isAppError, isInputError, isSuccess } from '../shared/api-response';
import { asyncAttempt, exhaustivenessCheck, isErr } from '../shared/lang';
import {
  ApiResponseUiElements,
  HttpMethod,
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
} from './shared';

async function main() {
  const queryParams = requireQueryParams<RequiredParams>({
    feedId: 'feedId',
    displayName: 'displayName',
  });

  if (isErr(queryParams)) {
    displayInitError('Invalid subscription link');
    return;
  }
  const uiElements = requireUiElements<RequiredUiElements>({
    ...apiResponseUiElements,
    ctaTextFeedName: '#cta-text-feed-name',
    form: '#form',
    emailField: '#email-field',
    submitButton: '#submit-button',
  });

  if (isErr(uiElements)) {
    displayInitError(uiElements.reason);
    return;
  }

  uiElements.ctaTextFeedName.textContent = queryParams.displayName;
  uiElements.emailField.focus();

  initForm(uiElements, queryParams.feedId);
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
  displayName: string;
}

interface RequiredUiElements extends ApiResponseUiElements {
  ctaTextFeedName: HTMLElement;
  form: HTMLFormElement;
  emailField: HTMLInputElement;
  submitButton: HTMLButtonElement;
}

typeof window !== 'undefined' && main();
