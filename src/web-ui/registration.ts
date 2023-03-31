import { RegistrationRequestData } from '../domain/account';
import { ApiPath } from '../domain/api-path';
import { PagePath } from '../domain/page-path';
import { Plans } from '../domain/plan';
import { isAppError, isInputError, isSuccess } from '../shared/api-response';
import { asyncAttempt, isErr } from '../shared/lang';
import { createElement } from './dom-isolation';
import {
  apiResponseUiElements,
  AppStatusUiElements,
  clearValidationErrors,
  displayAppError,
  displayCommunicationError,
  displayInitError,
  displayValidationError,
  hideElement,
  HttpMethod,
  isAuthenticated,
  onSubmit,
  requireQueryParams,
  requireUiElements,
  sendApiRequest,
  unhideElement,
} from './shared';

function main() {
  if (isAuthenticated()) {
    location.href = PagePath.feedList;
    return;
  }

  const queryStringParams = requireQueryParams<RequiredParams>({
    plan: 'plan?',
  });

  if (isErr(queryStringParams)) {
    displayInitError(queryStringParams.reason);
    return;
  }

  const uiElements = requireUiElements<RequiredUiElements>({
    ...apiResponseUiElements,
    planDropdown: '#plan',
    email: '#email',
    password: '#password',
    submitButton: '#submit-button',
    appErrorMessage: '#app-error-message',
    confirmationMessage: '#confirmation-message',
  });

  if (isErr(uiElements)) {
    displayInitError(uiElements.reason);
    return;
  }

  initPlanDropdown(uiElements.planDropdown, queryStringParams.plan);

  onSubmit(uiElements.submitButton, async (event: Event) => {
    event.preventDefault();
    clearValidationErrors(uiElements);

    const request: RegistrationRequestData = {
      email: uiElements.email.value,
      password: uiElements.password.value,
    };

    const response = await asyncAttempt(() => sendApiRequest(ApiPath.registration, HttpMethod.POST, request));

    if (isErr(response)) {
      displayCommunicationError(response, uiElements.apiResponseMessage);
      return;
    }

    if (isAppError(response)) {
      displayAppError(response, uiElements.appErrorMessage);
      return;
    }

    if (isInputError(response)) {
      displayValidationError(response, uiElements);
      return;
    }

    if (isSuccess(response)) {
      unhideElement(uiElements.confirmationMessage);
      hideElement(uiElements.email.form!);
    }
  });
}

function initPlanDropdown(planDropdown: HTMLSelectElement, selectedPlan: string): void {
  planDropdown.append(
    ...Object.entries(Plans).map(([id, { title }]) =>
      createElement('option', title, { value: id, ...(selectedPlan === id ? { selected: 'selected' } : {}) })
    )
  );
}

interface RequiredUiElements extends FormUiElements, AppStatusUiElements {
  confirmationMessage: HTMLElement;
}

interface FormFields {
  planDropdown: HTMLSelectElement;
  email: HTMLInputElement;
  password: HTMLInputElement;
}

interface FormUiElements extends FormFields {
  submitButton: HTMLButtonElement;
}

interface RequiredParams {
  plan: string;
}

globalThis.window && main();
