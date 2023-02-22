import { isPlanId, makePlanId } from '../domain/plan';
import { isAppError, isInputError, isSuccess } from '../shared/api-response';
import { asyncAttempt, isErr } from '../shared/lang';
import { displayInitError, displayCommunicationError, unhideElement, displayAppError, HttpMethod } from './shared';
import { hideElement, preventDoubleClick, requireUiElements, AppStatusUiElements } from './shared';
import { sendApiRequest, clearValidationErrors, displayValidationError } from './shared';

function main() {
  const uiElements = requireUiElements<RegistrationUiElements>({
    plan: '#plan',
    email: '#email',
    password: '#password',
    submitButton: '#submit-button',
    apiResponseMessage: '#api-response-message',
    appErrorMessage: '#app-error-message',
    confirmationMessage: '#confirmation-message',
  });

  if (isErr(uiElements)) {
    displayInitError(uiElements.reason);
    return;
  }

  maybePreselectPlan(uiElements.plan, location.href);

  uiElements.submitButton.addEventListener('click', async (event: Event) => {
    event.preventDefault();
    clearValidationErrors(uiElements);

    preventDoubleClick(uiElements.submitButton, async () => {
      const response = await asyncAttempt(() =>
        sendApiRequest('/registration', HttpMethod.POST, {
          plan: uiElements.plan.value,
          email: uiElements.email.value,
          password: uiElements.password.value,
        })
      );

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
  });
}

export interface RegistrationUiElements extends FormUiElements, AppStatusUiElements {
  confirmationMessage: HTMLElement;
}

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
