import { RegistrationRequest, RegistrationRequestData, RegistrationResponseData } from '../domain/account';
import { ApiPath } from '../domain/api-path';
import { PagePath } from '../domain/page-path';
import { PlanId, isSubscriptionPlan, makePlanId } from '../domain/plan';
import { isAppError, isInputError, isSuccess, makeInputError } from '../shared/api-response';
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
  reportUnexpectedEmptyResponseData,
  requireQueryParams,
  requireUiElements,
  scrollToTop,
  sendApiRequest,
  unhideElement,
} from './shared';
import {
  PaymentSubformHandle,
  buildPlanDropdownOptions,
  makePaymentSubformHandle,
  maybeConfirmPayment,
  maybeValidatePaymentSubform,
} from './stripe-integration';

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
    paymentSubform: '#payment-subform',
    paymentSubformContainer: '#payment-subform-container',
    additionalActionsSection: '#additional-actions-section',
  });

  if (isErr(uiElements)) {
    displayInitError(uiElements.reason);
    return;
  }

  let planId = queryStringParams.plan ? makePlanId(queryStringParams.plan) : PlanId.Free;

  if (isErr(planId)) {
    displayInitError(planId.reason);
    return;
  }

  const paymentSubformHandle = await makePaymentSubformHandle(planId, uiElements.paymentSubform, () =>
    clearValidationErrors(uiElements)
  );

  if (isErr(paymentSubformHandle)) {
    displayInitError(paymentSubformHandle.reason);
    return;
  }

  const initPlanDropdownResult = await initPlanDropdown(uiElements, paymentSubformHandle, planId);

  if (isErr(initPlanDropdownResult)) {
    displayInitError(initPlanDropdownResult.reason);
    return;
  }

  initSubmitButton(uiElements, paymentSubformHandle);
}

function initSubmitButton(uiElements: RequiredUiElements, paymentSubformHandle: PaymentSubformHandle): void {
  const { planDropdown, emailField, passwordField, submitButton, apiResponseMessage, appErrorMessage } = uiElements;
  const { form, confirmationMessage, additionalActionsSection } = uiElements;

  onSubmit(submitButton, async (event: Event) => {
    event.preventDefault();
    clearValidationErrors(uiElements);
    hideElement(appErrorMessage);

    const planId = planDropdown.value;
    const paymentSubformResult = await maybeValidatePaymentSubform<keyof RequiredUiElements>(
      paymentSubformHandle,
      planId,
      'paymentSubform'
    );

    if (isInputError(paymentSubformResult)) {
      displayValidationError(paymentSubformResult, uiElements);
      paymentSubformHandle.focus();
      return;
    }

    const request: RegistrationRequestData = {
      planId: planId,
      email: emailField.value,
      password: passwordField.value,
    };

    const path = ApiPath.registration;
    const response = await asyncAttempt(() => sendApiRequest<RegistrationResponseData>(path, HttpMethod.POST, request));

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

    if (!response.responseData) {
      const inputError = makeInputError('Error: Empty response');
      displayValidationError(inputError, uiElements);
      reportUnexpectedEmptyResponseData(path);
      return;
    }

    if (!isSuccess(response)) {
      exhaustivenessCheck(response);
    }

    const { clientSecret } = response.responseData;
    const finishPaymentResult = await maybeConfirmPayment<keyof RequiredUiElements>(
      paymentSubformHandle,
      planId,
      clientSecret,
      'paymentSubform'
    );

    if (isInputError(finishPaymentResult)) {
      displayValidationError(finishPaymentResult, uiElements);
      paymentSubformHandle.focus();
      return;
    }

    hideElement(form);
    hideElement(additionalActionsSection);

    unhideElement(confirmationMessage);
    scrollToTop();
  });
}

export async function initPlanDropdown(
  uiElements: RequiredUiElements,
  paymentSubformHandle: PaymentSubformHandle,
  selectedPlanId: string
): Promise<Result<void>> {
  const { planDropdown, paymentSubformContainer } = uiElements;
  const options = await buildPlanDropdownOptions(selectedPlanId);

  if (isErr(options)) {
    return options;
  }

  planDropdown.replaceChildren(...options);

  const togglePaymentSubform = async (planIdString: string) => {
    const planId = makePlanId(planIdString);

    if (isErr(planId)) {
      displayInitError(planId.reason);
      return;
    }

    if (isSubscriptionPlan(planId)) {
      const updateResult = await paymentSubformHandle.setPlanId(planId);

      if (isErr(updateResult)) {
        displayInitError(updateResult.reason);
        return;
      }

      unhideElement(paymentSubformContainer);
    } else {
      hideElement(paymentSubformContainer);
    }
  };

  planDropdown.addEventListener('change', () => {
    clearValidationErrors(uiElements);
    togglePaymentSubform(planDropdown.value);
  });

  togglePaymentSubform(planDropdown.value);
}

interface RequiredUiElements extends FormUiElements, AppStatusUiElements {
  confirmationMessage: HTMLElement;
  paymentSubform: HTMLElement;
  paymentSubformContainer: HTMLElement;
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
