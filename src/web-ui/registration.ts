import { RegistrationRequest, RegistrationRequestData } from '../domain/account';
import { ApiPath } from '../domain/api-path';
import { PagePath } from '../domain/page-path';
import { PlanId, makePlanId } from '../domain/plan';
import { isAppError, isInputError, isSuccess } from '../shared/api-response';
import { Result, asyncAttempt, exhaustivenessCheck, isErr } from '../shared/lang';
import {
  AppStatusUiElements,
  HttpMethod,
  apiResponseUiElements,
  clearValidationErrors,
  displayAppError,
  displayCommunicationError,
  displayInitError,
  displayValidationError,
  hideElement,
  isAuthenticated,
  onSubmit,
  requireQueryParams,
  requireUiElements,
  scrollToTop,
  sendApiRequest,
  unhideElement,
} from './shared';
import { buildPlanDropdownOptions } from './payment-integration';

async function main() {
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
    form: '#registration-form',
    planDropdown: '#plan',
    emailField: '#email',
    passwordField: '#password',
    submitButton: '#submit-button',
    appErrorMessage: '#app-error-message',
    confirmationMessage: '#confirmation-message',
    additionalActionsSection: '#additional-actions-section',
  });

  if (isErr(uiElements)) {
    displayInitError(uiElements.reason);
    return;
  }

  const planId = queryStringParams.plan ? makePlanId(queryStringParams.plan) : PlanId.Courage;

  if (isErr(planId)) {
    displayInitError(planId.reason);
    return;
  }

  const initPlanDropdownResult = await initPlanDropdown(uiElements, planId);

  if (isErr(initPlanDropdownResult)) {
    displayInitError(initPlanDropdownResult.reason);
    return;
  }

  initSubmitButton(uiElements);
}

function initSubmitButton(uiElements: RequiredUiElements): void {
  const { planDropdown, emailField, passwordField, submitButton, apiResponseMessage, appErrorMessage } = uiElements;
  const { form, confirmationMessage, additionalActionsSection } = uiElements;

  onSubmit(submitButton, async (event: Event) => {
    event.preventDefault();
    clearValidationErrors(uiElements);
    hideElement(appErrorMessage);

    const planId = planDropdown.value;
    const request: RegistrationRequestData = {
      planId: planId,
      email: emailField.value,
      password: passwordField.value,
    };

    const path = ApiPath.registration;
    const response = await asyncAttempt(() => sendApiRequest(path, HttpMethod.POST, request));

    if (isErr(response)) {
      displayCommunicationError(response, apiResponseMessage);
      return;
    }

    if (isAppError(response)) {
      displayAppError(response, appErrorMessage);
      return;
    }

    if (isInputError(response)) {
      const formFields: Record<keyof RegistrationRequest, HTMLElement> = {
        planId: uiElements.planDropdown,
        password: uiElements.passwordField,
        email: uiElements.emailField,
      };
      displayValidationError(response, formFields);
      return;
    }

    if (!isSuccess(response)) {
      exhaustivenessCheck(response);
    }

    // Payment has moved to the confirmation page: nothing is charged until the address is
    // confirmed, so registration now ends at "check your email".
    hideElement(submitButton);
    hideElement(form);
    hideElement(additionalActionsSection);

    unhideElement(confirmationMessage);
    scrollToTop();
  });
}

export async function initPlanDropdown(uiElements: RequiredUiElements, selectedPlanId: string): Promise<Result<void>> {
  const { planDropdown } = uiElements;
  const options = await buildPlanDropdownOptions(selectedPlanId);

  if (isErr(options)) {
    return options;
  }

  planDropdown.replaceChildren(...options);

  planDropdown.addEventListener('change', () => {
    clearValidationErrors(uiElements);
  });
}

interface RequiredUiElements extends FormUiElements, AppStatusUiElements {
  confirmationMessage: HTMLElement;
  additionalActionsSection: HTMLElement;
}

interface FormFields {
  planDropdown: HTMLSelectElement;
  emailField: HTMLInputElement;
  passwordField: HTMLInputElement;
}

interface FormUiElements extends FormFields {
  form: HTMLFormElement;
  submitButton: HTMLButtonElement;
}

interface RequiredParams {
  plan: string;
}

typeof window !== 'undefined' && main();
