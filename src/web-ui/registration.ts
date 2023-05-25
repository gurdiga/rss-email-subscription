import { RegistrationRequestData } from '../domain/account';
import { ApiPath } from '../domain/api-path';
import { PagePath } from '../domain/page-path';
import { PlanId, Plans, makePlanId } from '../domain/plan';
import { InputError, isAppError, isInputError, isSuccess, makeInputError } from '../shared/api-response';
import { asyncAttempt, isErr } from '../shared/lang';
import { createElement } from './dom-isolation';
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
  sendApiRequest,
  unhideElement,
} from './shared';
import { PaymentSubformHandle, initPaymentSubform, submitPaymentSubform } from './stripe-integration';

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
    email: '#email',
    password: '#password',
    submitButton: '#submit-button',
    appErrorMessage: '#app-error-message',
    confirmationMessage: '#confirmation-message',
    paymentSubform: '#payment-subform',
    paymentSubformContainer: '#payment-subform-container',
    additionalActionsSection: '#additional-actions-section',
  });

  if (isErr(uiElements)) {
    displayInitError(uiElements.reason);
    return;
  }

  const paymentSubformHandle = await initPaymentSubform(uiElements.paymentSubform);

  if (isErr(paymentSubformHandle)) {
    displayInitError(paymentSubformHandle.reason);
    return;
  }

  initPlanDropdown(uiElements, queryStringParams.plan);
  initSubmitButton(uiElements, paymentSubformHandle);
}

function initSubmitButton(uiElements: RequiredUiElements, paymentSubformHandle: PaymentSubformHandle): void {
  const { planDropdown, email, password, submitButton, apiResponseMessage, appErrorMessage } = uiElements;
  const { form, confirmationMessage, additionalActionsSection } = uiElements;

  onSubmit(submitButton, async (event: Event) => {
    event.preventDefault();
    clearValidationErrors(uiElements);

    const paymentFormResult = maybeValidatePaymentSubform(paymentSubformHandle, uiElements);

    if (isInputError(paymentFormResult)) {
      displayValidationError(paymentFormResult, uiElements);
      paymentSubformHandle.focus();
      return;
    }

    const request: RegistrationRequestData = {
      planId: planDropdown.value,
      email: email.value,
      password: password.value,
    };

    const response = await asyncAttempt(() => sendApiRequest(ApiPath.registration, HttpMethod.POST, request));

    if (isErr(response)) {
      displayCommunicationError(response, apiResponseMessage);
      return;
    }

    if (isAppError(response)) {
      displayAppError(response, appErrorMessage);
      return;
    }

    if (isInputError(response)) {
      displayValidationError(response, uiElements);
      return;
    }

    if (isSuccess(response)) {
      unhideElement(confirmationMessage);
      hideElement(form);
      hideElement(additionalActionsSection);
    }
  });
}

function initPlanDropdown(uiElements: RequiredUiElements, selectedPlan: string): void {
  const { planDropdown, paymentSubformContainer } = uiElements;

  planDropdown.replaceChildren(
    ...Object.entries(Plans)
      .filter(([id]) => id !== PlanId.SDE)
      .map(([id, { title }]) => {
        const option = createElement('option', title, { value: id });

        if (id === selectedPlan) {
          option.selected = true;
        }

        return option;
      })
  );

  planDropdown.addEventListener('change', () => {
    clearValidationErrors(uiElements);

    if (isPaymentRequired(planDropdown.value)) {
      unhideElement(paymentSubformContainer);
    } else {
      hideElement(paymentSubformContainer);
    }
  });
}

function maybeValidatePaymentSubform(
  paymentSubformHandle: PaymentSubformHandle,
  uiElements: RequiredUiElements
): InputError | void {
  if (!isPaymentRequired(uiElements.planDropdown.value)) {
    return;
  }

  const paymentSubformError = submitPaymentSubform(paymentSubformHandle);

  if (isErr(paymentSubformError)) {
    const fieldName: keyof RequiredUiElements = 'paymentSubform';
    const inputError = makeInputError(paymentSubformError.reason, fieldName);

    return inputError;
  }
}

function isPaymentRequired(planIdString: string): boolean {
  const planId = makePlanId(planIdString);

  if (isErr(planId)) {
    return false;
  }

  return planId === PlanId.PayPerUse;
}

interface RequiredUiElements extends FormUiElements, AppStatusUiElements {
  confirmationMessage: HTMLElement;
  paymentSubform: HTMLElement;
  paymentSubformContainer: HTMLElement;
  additionalActionsSection: HTMLElement;
}

interface FormFields {
  planDropdown: HTMLSelectElement;
  email: HTMLInputElement;
  password: HTMLInputElement;
}

interface FormUiElements extends FormFields {
  form: HTMLFormElement;
  submitButton: HTMLButtonElement;
}

interface RequiredParams {
  plan: string;
}

typeof window !== 'undefined' && main();
