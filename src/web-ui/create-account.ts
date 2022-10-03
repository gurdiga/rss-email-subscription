import { isPlanId, makePlanId } from '../domain/plan';
import { isInputError, isSuccess } from '../shared/api-response';
import { attempt, isErr } from '../shared/lang';
import {
  displayMainError,
  displayApiResponse,
  displayCommunicationError,
  preventDoubleClick,
  ApiResponseUiElements,
} from './shared';
import { requireUiElements, sendApiRequest, clearValidationErrors, displayValidationError } from './shared';

function main() {
  const uiElements = requireUiElements<CreateAccountUiElements>({
    plan: '#plan',
    email: '#email',
    password: '#password',
    submitButton: '#submit-button',
    apiResponseMessage: '#api-response-message',
  });

  if (isErr(uiElements)) {
    displayMainError(uiElements.reason);
    return;
  }

  maybePreselectPlan(uiElements.plan, location.href);

  uiElements.submitButton.addEventListener('click', async (event: Event) => {
    event.preventDefault();
    clearValidationErrors(uiElements);

    preventDoubleClick(uiElements.submitButton, async () => {
      const response = await attempt(() =>
        sendApiRequest('/create-account', {
          plan: uiElements.plan.value,
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
        setTimeout(() => {
          location.href = '/dashboard.html';
        }, 2000);
      }
    });
  });
}

export interface CreateAccountUiElements extends FormUiElements, ApiResponseUiElements {}

export interface FormFields {
  plan: HTMLSelectElement;
  email: HTMLInputElement;
  password: HTMLInputElement;
}

export interface FormUiElements extends FormFields {
  submitButton: HTMLButtonElement;
}

export function maybePreselectPlan(planDropDown: HTMLSelectElement, locationHref: string) {
  const planParam = new URL(locationHref).searchParams.get('plan')!;
  const planId = makePlanId(planParam);

  if (isPlanId(planId)) {
    planDropDown.value = planId;
  }
}

globalThis.window && main();
