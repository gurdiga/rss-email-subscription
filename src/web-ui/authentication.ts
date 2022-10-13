import { isInputError, isSuccess } from '../shared/api-response';
import { attempt, isErr } from '../shared/lang';
import { navigateTo, sendApiRequest } from './shared';
import { clearValidationErrors, displayApiResponse, displayCommunicationError, displayMainError } from './shared';
import { displayValidationError, preventDoubleClick, requireUiElements, ApiResponseUiElements } from './shared';

export interface AuthenticationUiElements extends FormUiElements, ApiResponseUiElements {}

export interface FormFields {
  email: HTMLInputElement;
  password: HTMLInputElement;
}

export interface FormUiElements extends FormFields {
  submitButton: HTMLButtonElement;
}

function main() {
  const uiElements = requireUiElements<AuthenticationUiElements>({
    email: '#email',
    password: '#password',
    submitButton: '#submit-button',
    apiResponseMessage: '#api-response-message',
  });

  if (isErr(uiElements)) {
    displayMainError(uiElements.reason);
    return;
  }

  uiElements.submitButton.addEventListener('click', async (event: Event) => {
    event.preventDefault();
    clearValidationErrors(uiElements);

    preventDoubleClick(uiElements.submitButton, async () => {
      const response = await attempt(() =>
        sendApiRequest('/authentication', {
          email: uiElements.email.value,
          password: uiElements.password.value,
        })
      );

      if (isErr(response)) {
        displayCommunicationError(response, uiElements.apiResponseMessage);
        return;
      }

      if (isInputError(response)) {
        displayValidationError(response, uiElements);
        return;
      }

      displayApiResponse(response, uiElements.apiResponseMessage);

      if (isSuccess(response)) {
        navigateTo('/dashboard.html', 2000);
      }
    });
  });
}

main();
