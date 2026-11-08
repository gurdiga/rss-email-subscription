import { RegistrationConfirmationRequestData } from '../domain/account';
import { ApiPath } from '../domain/api-path';
import { PagePath } from '../domain/page-path';
import { isAppError, isInputError, isSuccess } from '../shared/api-response';
import { asyncAttempt, exhaustivenessCheck, isErr } from '../shared/lang';
import {
  apiResponseUiElements,
  ApiResponseUiElements,
  clearValidationErrors,
  displayApiResponse,
  displayCommunicationError,
  displayInitError,
  displayValidationError,
  getConfirmationSecretParams,
  hideElement,
  HttpMethod,
  navigateTo,
  onSubmit,
  requireQueryParams,
  requireUiElements,
  sendApiRequest,
  SpinnerUiElements,
  spinnerUiElements,
  unhideElement,
} from './shared';

function main() {
  const queryStringParams = requireQueryParams<RequiredParams>({ secret: 'secret' }, getConfirmationSecretParams());

  if (isErr(queryStringParams)) {
    displayInitError(queryStringParams.reason);
    return;
  }

  const uiElements = requireUiElements<RequiredUiElements>({
    ...spinnerUiElements,
    ...apiResponseUiElements,
    form: '#form',
    passwordField: '#password-field',
    submitButton: '#submit-button',
  });

  if (isErr(uiElements)) {
    displayInitError(uiElements.reason);
    return;
  }

  hideElement(uiElements.spinner);
  unhideElement(uiElements.form);
  initForm(uiElements, queryStringParams.secret);
}

function initForm(uiElements: RequiredUiElements, secret: string): void {
  const { form, passwordField, submitButton, spinner, apiResponseMessage } = uiElements;

  onSubmit(submitButton, async (event) => {
    event.preventDefault();
    clearValidationErrors(uiElements);
    hideElement(apiResponseMessage);
    unhideElement(spinner);

    const request: RegistrationConfirmationRequestData = { secret, password: passwordField.value };
    const response = await asyncAttempt(() =>
      sendApiRequest(ApiPath.registrationConfirmation, HttpMethod.POST, request)
    );

    hideElement(spinner);

    if (isErr(response)) {
      displayCommunicationError(response, apiResponseMessage);
      return;
    }

    // As on the password reset page: only a password error belongs to the field, and
    // anything else, about the link or with no field at all, is a general message.
    if (isInputError(response)) {
      if (response.field === 'password') {
        displayValidationError(response, { password: passwordField });
        return;
      }

      displayApiResponse(response, apiResponseMessage);
      return;
    }

    if (isAppError(response)) {
      displayApiResponse(response, apiResponseMessage);
      return;
    }

    if (isSuccess(response)) {
      hideElement(form);
      displayApiResponse(response, apiResponseMessage);
      navigateTo(PagePath.userStart, 2000);
      return;
    }

    exhaustivenessCheck(response);
  });
}

interface RequiredParams {
  secret: string;
}

interface RequiredUiElements extends ApiResponseUiElements, SpinnerUiElements {
  form: HTMLFormElement;
  passwordField: HTMLInputElement;
  submitButton: HTMLButtonElement;
}

main();
