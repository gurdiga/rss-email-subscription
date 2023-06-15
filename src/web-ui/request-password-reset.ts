import { ApiPath } from '../domain/api-path';
import { PasswordResetRequestData } from '../domain/password-reset';
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
  unhideElement,
} from './shared';

function main(): void {
  const queryStringParams = requireQueryParams<RequiredParams>({
    email: 'email?',
  });

  if (isErr(queryStringParams)) {
    displayInitError(queryStringParams.reason);
    return;
  }

  const uiElements = requireUiElements<RequiredUiElements>({
    ...apiResponseUiElements,
    form: '#form',
    emailField: '#email-field',
    submitButton: '#submit-button',
    successMessage: '#success-message',
  });

  if (isErr(uiElements)) {
    displayInitError(uiElements.reason);
    return;
  }

  maybeAutofillEmail(uiElements, queryStringParams);
  initForm(uiElements);
}

function initForm(uiElements: RequiredUiElements): void {
  const { form, submitButton, emailField, apiResponseMessage, successMessage } = uiElements;

  onSubmit(submitButton, async (event: Event) => {
    event.preventDefault();
    clearValidationErrors(uiElements);
    hideElement(apiResponseMessage);

    const request: PasswordResetRequestData = {
      email: emailField.value,
    };
    const response = await asyncAttempt(() => sendApiRequest(ApiPath.requestPasswordReset, HttpMethod.POST, request));

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
      hideElement(form);
      unhideElement(successMessage);
      return;
    }

    exhaustivenessCheck(response);
  });
}

function maybeAutofillEmail(uiElements: RequiredUiElements, queryStringParams: RequiredParams): void {
  if (queryStringParams.email) {
    uiElements.emailField.value = queryStringParams.email;
  }
}

interface RequiredUiElements extends ApiResponseUiElements {
  form: HTMLFormElement;
  emailField: HTMLInputElement;
  submitButton: HTMLButtonElement;
  successMessage: HTMLElement;
}

interface RequiredParams {
  email: string;
}

main();
