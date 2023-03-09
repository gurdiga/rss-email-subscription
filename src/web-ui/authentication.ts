import { AuthenticationRequestData } from '../domain/account';
import { PagePath } from '../domain/page-path';
import { isInputError, isSuccess } from '../shared/api-response';
import { asyncAttempt, isErr } from '../shared/lang';
import {
  apiResponseUiElements,
  ApiResponseUiElements,
  clearValidationErrors,
  displayApiResponse,
  displayCommunicationError,
  displayInitError,
  displayValidationError,
  HttpMethod,
  isAuthenticated,
  navigateTo,
  preventDoubleClick,
  requireUiElements,
  sendApiRequest,
} from './shared';

function main() {
  if (isAuthenticated()) {
    location.href = PagePath.feedList;
    return;
  }

  const uiElements = requireUiElements<RequiredUiElements>({
    ...apiResponseUiElements,
    email: '#email',
    password: '#password',
    submitButton: '#submit-button',
  });

  if (isErr(uiElements)) {
    displayInitError(uiElements.reason);
    return;
  }

  uiElements.submitButton.addEventListener('click', async (event: Event) => {
    event.preventDefault();
    clearValidationErrors(uiElements);

    preventDoubleClick(uiElements.submitButton, async () => {
      const request: AuthenticationRequestData = {
        email: uiElements.email.value,
        password: uiElements.password.value,
      };
      const response = await asyncAttempt(() => sendApiRequest('/authentication', HttpMethod.POST, request));

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
        navigateTo(PagePath.userStart, 1000);
      }
    });
  });
}

export interface RequiredUiElements extends FormUiElements, ApiResponseUiElements {}

export interface FormFields {
  email: HTMLInputElement;
  password: HTMLInputElement;
}

export interface FormUiElements extends FormFields {
  submitButton: HTMLButtonElement;
}

main();
