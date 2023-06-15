import { ApiPath } from '../domain/api-path';
import { PasswordResetConfirmationData } from '../domain/password-reset';
import { isInputError, isAppError, isSuccess } from '../shared/api-response';
import { asyncAttempt, exhaustivenessCheck, isErr } from '../shared/lang';
import {
  requireQueryParams,
  displayInitError,
  requireUiElements,
  apiResponseUiElements,
  onSubmit,
  clearValidationErrors,
  hideElement,
  ApiResponseUiElements,
  HttpMethod,
  displayApiResponse,
  displayCommunicationError,
  displayValidationError,
  sendApiRequest,
  unhideElement,
} from './shared';

async function main() {
  const queryStringParams = requireQueryParams<RequiredParams>({
    secret: 'secret',
  });

  if (isErr(queryStringParams)) {
    displayInitError(queryStringParams.reason);
    return;
  }

  const uiElements = requireUiElements<RequiredUiElements>({
    ...apiResponseUiElements,
    form: '#form',
    newPasswordField: '#new-password-field',
    submitButton: '#submit-button',
    successMessage: '#success-message',
  });

  if (isErr(uiElements)) {
    displayInitError(uiElements.reason);
    return;
  }

  initForm(uiElements, queryStringParams);
}

function initForm(uiElements: RequiredUiElements, queryStringParams: RequiredParams): void {
  const { form, newPasswordField, submitButton, apiResponseMessage, successMessage } = uiElements;

  onSubmit(submitButton, async (event) => {
    event.preventDefault();
    clearValidationErrors(uiElements);
    hideElement(apiResponseMessage);

    const request: PasswordResetConfirmationData = {
      secret: queryStringParams.secret,
      newPassword: newPasswordField.value,
    };
    const response = await asyncAttempt(() => sendApiRequest(ApiPath.confirmPasswordReset, HttpMethod.POST, request));

    if (isErr(response)) {
      displayCommunicationError(response, apiResponseMessage);
      return;
    }

    if (isInputError(response)) {
      const field = response.field as keyof PasswordResetConfirmationData;

      if (field === 'newPassword') {
        displayValidationError(response, { newPassword: uiElements.newPasswordField });
        return;
      }

      if (field === 'secret') {
        displayApiResponse(response, apiResponseMessage);
        return;
      }

      exhaustivenessCheck(field);
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

interface RequiredParams {
  secret: string;
}

interface RequiredUiElements extends ApiResponseUiElements {
  form: HTMLFormElement;
  newPasswordField: HTMLInputElement;
  submitButton: HTMLButtonElement;
  successMessage: HTMLElement;
}

main();
