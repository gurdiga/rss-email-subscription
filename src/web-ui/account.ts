import {
  DeleteAccountRequestData,
  EmailChangeRequestData,
  PasswordChangeRequestData,
  PlanChangeRequestData,
  PlanChangeResponseData,
  UiAccount,
} from '../domain/account';
import { ApiPath } from '../domain/api-path';
import { PagePath } from '../domain/page-path';
import { PlanId, Plans, isPaidPlan } from '../domain/plan';
import { Card, makeCardDescription } from '../domain/stripe-integration';
import { ApiResponse, isAppError, isInputError, isSuccess } from '../shared/api-response';
import { Result, StringKey, asyncAttempt, isErr, makeErr } from '../shared/lang';
import { si } from '../shared/string-utils';
import { createElement } from './dom-isolation';
import {
  ElementSelectors,
  HttpMethod,
  SpinnerUiElements,
  UiElementsBase,
  clearValidationErrors,
  disableElement,
  displayApiResponse,
  displayCommunicationError,
  displayInitError,
  displayValidationError,
  fillUiElements,
  hideElement,
  navigateTo,
  onClick,
  onSubmit,
  reportUnexpectedEmptyResponseData,
  requireUiElements,
  scrollIntoView,
  sendApiRequest,
  spinnerUiElements,
  unhideElement,
} from './shared';
import {
  PaymentSubformHandle,
  initPaymentSubform,
  maybeConfirmPayment,
  maybeValidatePaymentSubform,
} from './stripe-integration';

async function main() {
  const uiElements = requireUiElements<RequiredUiElements>({
    ...spinnerUiElements,
    ...emailUiElements,
    ...passwordUiElements,
    ...planUiElements,
    ...deleteAccountUiElements,
  });

  if (isErr(uiElements)) {
    displayInitError(uiElements.reason);
    return;
  }

  const uiAccount = await loadUiAccount();

  uiElements.spinner.remove();

  if (isErr(uiAccount)) {
    displayInitError(uiAccount.reason);
    return;
  }

  const fillUiResult = fillUi(uiElements, uiAccount);

  if (isErr(fillUiResult)) {
    displayInitError(fillUiResult.reason);
    return;
  }

  addEmailChangeEventHandlers(uiElements);
  addPasswordChangeEventHandlers(uiElements);
  addPlanChangeEventHandlers(uiElements, uiAccount.planId);
  addDeleteAccountEventHandlers(uiElements);
}

function addDeleteAccountEventHandlers(uiElements: DeleteAccountUiElements): void {
  const { deleteAccountButton, deleteAccountSection, deleteAccountConfirmationSection } = uiElements;
  const { deleteAccountPasswordField, deleteAccountSubmitButton, deleteAccountCancelButton } = uiElements;
  const { deleteAccountSuccessMessage } = uiElements;

  onClick(deleteAccountButton, () => {
    hideElement(deleteAccountSection);
    unhideElement(deleteAccountConfirmationSection);
    deleteAccountPasswordField.focus();
  });

  const dismissChangeForm = () => {
    clearValidationErrors(uiElements);
    hideElement(deleteAccountSuccessMessage);
    hideElement(deleteAccountConfirmationSection);
    unhideElement(deleteAccountSection);
  };

  onClick(deleteAccountCancelButton, dismissChangeForm);
  onEscape(deleteAccountPasswordField, dismissChangeForm);

  onSubmit(deleteAccountSubmitButton, async () => {
    clearValidationErrors(uiElements);
    hideElement(deleteAccountSuccessMessage);
    await submitDeleteAccountRequest(uiElements);
  });
}

async function submitDeleteAccountRequest(uiElements: DeleteAccountUiElements) {
  const { deleteAccountPasswordField, deleteAccountApiResponseMessage } = uiElements;
  const { deleteAccountSuccessMessage, deleteAccountSubmitButton, deleteAccountCancelButton } = uiElements;

  const request: DeleteAccountRequestData = { password: deleteAccountPasswordField.value };
  const response = await asyncAttempt(() =>
    sendApiRequest(ApiPath.deleteAccountWithPassword, HttpMethod.POST, request)
  );

  handleApiResponse(
    response,
    deleteAccountApiResponseMessage,
    {
      password: deleteAccountPasswordField,
    },
    () => {
      hideElement(deleteAccountApiResponseMessage);
      unhideElement(deleteAccountSuccessMessage);
      deleteAccountSuccessMessage.scrollIntoView({ behavior: 'smooth' });
      disableElement(deleteAccountPasswordField, deleteAccountSubmitButton, deleteAccountCancelButton);
      navigateTo(PagePath.home, 7000);
    }
  );
}

async function addPlanChangeEventHandlers(uiElements: PlanUiElements, currentPlanId: PlanId): Promise<void> {
  const { changePlanButton, cancelPlanChangeButton, submitNewPlanButton } = uiElements;
  const { viewPlanSection, changePlanSection, planChangeSuccessMessage, planDropdown } = uiElements;

  initlansDropdown(uiElements, currentPlanId);

  const paymentSubformHandle = await initPaymentSubform(uiElements.paymentSubform, () =>
    clearValidationErrors(uiElements)
  );

  if (isErr(paymentSubformHandle)) {
    displayInitError(paymentSubformHandle.reason);
    return;
  }

  onClick(changePlanButton, () => {
    hideElement(viewPlanSection);
    unhideElement(changePlanSection);
    planDropdown.focus();
  });

  const dismissChangeForm = () => {
    clearValidationErrors(uiElements);
    hideElement(planChangeSuccessMessage);
    hideElement(changePlanSection);
    unhideElement(viewPlanSection);
  };

  onClick(cancelPlanChangeButton, dismissChangeForm);
  onEscape(planDropdown, dismissChangeForm);

  onSubmit(submitNewPlanButton, async () => {
    clearValidationErrors(uiElements);
    hideElement(planChangeSuccessMessage);
    await submitNewPlan(uiElements, paymentSubformHandle);
  });
}

function handleApiResponse<T>(
  response: Result<ApiResponse<T>>,
  apiResponseMessage: HTMLElement,
  formFields: Record<string, HTMLElement>,
  onSuccess: (responseData: T | undefined) => void
) {
  if (isErr(response)) {
    displayCommunicationError(response, apiResponseMessage);
    return;
  }

  if (isAppError(response)) {
    displayApiResponse(response, apiResponseMessage);
    return;
  }

  if (isInputError(response)) {
    displayValidationError(response, formFields);
    return;
  }

  if (isSuccess(response)) {
    onSuccess(response.responseData);
  }
}

async function submitNewPlan(uiElements: PlanUiElements, paymentSubformHandle: PaymentSubformHandle) {
  const { currentPlanLabel, planDropdown, planChangeApiResponseMessage, planChangeSuccessMessage } = uiElements;
  const { changePlanSection, paymentSubformContainer, currentCardField } = uiElements;

  const newPlanId = planDropdown.value as PlanId;
  const paymentSubformResult = await maybeValidatePaymentSubform<StringKey<RequiredUiElements>>(
    paymentSubformHandle,
    newPlanId,
    'paymentSubform'
  );

  if (isInputError(paymentSubformResult)) {
    displayValidationError(paymentSubformResult, uiElements);
    paymentSubformHandle.focus();
    return;
  }

  const apiPath = ApiPath.requestAccountPlanChange;
  const request: PlanChangeRequestData = { planId: newPlanId };
  const response = await asyncAttempt(() => sendApiRequest<PlanChangeResponseData>(apiPath, HttpMethod.POST, request));

  handleApiResponse(
    // prettier: keep these stacked
    response,
    planChangeApiResponseMessage,
    { planId: planDropdown },
    async (responseData) => {
      if (!responseData && isPaidPlan(newPlanId)) {
        reportUnexpectedEmptyResponseData(apiPath);
        return;
      }

      const { clientSecret } = responseData as PlanChangeResponseData;
      const card = await maybeConfirmPayment<StringKey<RequiredUiElements>>(
        paymentSubformHandle,
        newPlanId,
        clientSecret,
        'paymentSubform'
      );

      if (isInputError(card)) {
        displayValidationError(card, uiElements);
        paymentSubformHandle.focus();
        return;
      }

      if (card) {
        displayCard(uiElements, card);
      } else {
        hideElement(currentCardField);
      }

      currentPlanLabel.textContent = Plans[newPlanId].title;
      hideElement(paymentSubformContainer);
      unhideElement(planChangeSuccessMessage);
      scrollIntoView(changePlanSection);
    }
  );
}

function displayCard(uiElements: PlanUiElements, card: Card): void {
  uiElements.currentCardDescription.textContent = makeCardDescription(card);
  unhideElement(uiElements.currentCardField);
}

function initlansDropdown(uiElements: PlanUiElements, currentPlanId: PlanId) {
  const { planDropdown, paymentSubformContainer } = uiElements;

  const planOptions = Object.entries(Plans)
    .filter(([id]) => id !== PlanId.SDE)
    .map(([id, { title }]) =>
      createElement('option', title, {
        value: id,
        ...(currentPlanId === id ? { selected: 'selected' } : {}),
      })
    );

  planDropdown.replaceChildren(...planOptions);

  const togglePaymentSubform = (planId: string) => {
    if (isPaidPlan(planId)) {
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

function addPasswordChangeEventHandlers(uiElements: PasswordUiElements): void {
  const { changePasswordButton, viewPasswordSection, changePasswordForm, currentPasswordField } = uiElements;
  const { submitNewPasswordButton, cancelPasswordChangeButton, passwordChangeSuccessMessage } = uiElements;

  onClick(changePasswordButton, () => {
    hideElement(viewPasswordSection);
    unhideElement(changePasswordForm);
    currentPasswordField.focus();
  });

  const dismissChangePasswordForm = () => {
    clearValidationErrors(uiElements);
    hideElement(passwordChangeSuccessMessage);
    hideElement(changePasswordForm);
    unhideElement(viewPasswordSection);
  };

  onClick(cancelPasswordChangeButton, dismissChangePasswordForm);
  onEscape(changePasswordForm, dismissChangePasswordForm);

  onSubmit(submitNewPasswordButton, async () => {
    clearValidationErrors(uiElements);
    hideElement(passwordChangeSuccessMessage);
    await submitNewPassword(uiElements);
  });
}

async function submitNewPassword(uiElements: PasswordUiElements) {
  const { currentPasswordField, newPasswordField, passwordChangeSuccessMessage } = uiElements;
  const { passwordChangeApiResponseMessage } = uiElements;

  const request: PasswordChangeRequestData = {
    currentPassword: currentPasswordField.value,
    newPassword: newPasswordField.value,
  };
  const response = await asyncAttempt(() =>
    sendApiRequest(ApiPath.requestAccountPasswordChange, HttpMethod.POST, request)
  );

  handleApiResponse(
    response,
    passwordChangeApiResponseMessage,
    {
      currentPassword: currentPasswordField,
      newPassword: newPasswordField,
    },
    () => {
      unhideElement(passwordChangeSuccessMessage);
      currentPasswordField.value = '';
      newPasswordField.value = '';
    }
  );
}

function addEmailChangeEventHandlers(uiElements: EmailUiElements): void {
  const { changeEmailButton, viewEmailSection, changeEmailForm, cancelEmailChangeButton } = uiElements;
  const { submitNewEmailButton, newEmailField, emailChangeSuccessMessage } = uiElements;

  onClick(changeEmailButton, () => {
    hideElement(viewEmailSection);
    unhideElement(changeEmailForm);
    newEmailField.focus();
  });

  const dismissChangeEmailForm = () => {
    clearValidationErrors(uiElements);
    hideElement(emailChangeSuccessMessage);
    hideElement(changeEmailForm);
    unhideElement(viewEmailSection);
  };

  onClick(cancelEmailChangeButton, dismissChangeEmailForm);
  onEscape(newEmailField, dismissChangeEmailForm);

  onSubmit(submitNewEmailButton, async () => {
    clearValidationErrors(uiElements);
    hideElement(emailChangeSuccessMessage);
    await submitNewEmail(uiElements);
  });
}

async function submitNewEmail(uiElements: EmailUiElements) {
  const { newEmailField, newEmailLabel, emailChangeSuccessMessage, emailChangeApiResponseMessage } = uiElements;

  const newEmail = newEmailField.value;
  const request: EmailChangeRequestData = { newEmail };
  const response = await asyncAttempt(() =>
    sendApiRequest(ApiPath.requestAccountEmailChange, HttpMethod.POST, request)
  );

  handleApiResponse(
    response,
    emailChangeApiResponseMessage,
    {
      newEmail: newEmailField,
    },
    () => {
      unhideElement(emailChangeSuccessMessage);
      newEmailLabel.textContent = newEmail;
      newEmailField.value = '';
    }
  );
}

function fillUi(uiElements: RequiredUiElements, uiAccount: UiAccount) {
  let result = fillUiElements([
    {
      element: uiElements.currentEmailLabel,
      propName: 'textContent',
      value: uiAccount.email,
    },
    {
      element: uiElements.currentPlanLabel,
      propName: 'textContent',
      value: Plans[uiAccount.planId].title,
    },
  ]);

  if (isErr(result)) {
    return result;
  }

  if (isPaidPlan(uiAccount.planId)) {
    result = fillUiElements([
      {
        element: uiElements.currentCardDescription,
        propName: 'textContent',
        value: uiAccount.cardDescription,
      },
    ]);

    unhideElement(uiElements.currentCardField);
  }

  return result;
}

async function loadUiAccount<T = UiAccount>(): Promise<Result<T>> {
  const response = await asyncAttempt(() => sendApiRequest<T>(ApiPath.loadCurrentAccount));

  if (isErr(response)) {
    return makeErr('Failed to load the account information');
  }

  if (isAppError(response)) {
    return makeErr(si`Application error when loading the account information: ${response.message}`);
  }

  if (isInputError(response)) {
    return makeErr('Input error when loading the account information');
  }

  return response.responseData!;
}

function onEscape(element: HTMLElement, f: Function) {
  element.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.code === 'Escape') {
      f();
    }
  });
}

interface RequiredUiElements
  extends UiElementsBase,
    SpinnerUiElements,
    EmailUiElements,
    PasswordUiElements,
    PlanUiElements,
    DeleteAccountUiElements {}

interface EmailUiElements {
  viewEmailSection: HTMLElement;
  currentEmailLabel: HTMLElement;
  changeEmailButton: HTMLButtonElement;
  changeEmailForm: HTMLFormElement;
  newEmailField: HTMLInputElement;
  newEmailLabel: HTMLElement;
  submitNewEmailButton: HTMLButtonElement;
  cancelEmailChangeButton: HTMLButtonElement;
  emailChangeApiResponseMessage: HTMLElement;
  emailChangeSuccessMessage: HTMLElement;
}

const emailUiElements: ElementSelectors<EmailUiElements> = {
  viewEmailSection: '#view-email-section',
  currentEmailLabel: '#current-email-label',
  changeEmailButton: '#change-email-button',
  changeEmailForm: '#change-email-section',
  newEmailField: '#new-email-field',
  newEmailLabel: '#new-email-label',
  submitNewEmailButton: '#submit-new-email-button',
  cancelEmailChangeButton: '#cancel-email-change-button',
  emailChangeApiResponseMessage: '#email-change-api-response-message',
  emailChangeSuccessMessage: '#email-change-success-message',
};

interface PasswordUiElements {
  changePasswordButton: HTMLButtonElement;
  viewPasswordSection: HTMLElement;
  changePasswordForm: HTMLFormElement;
  currentPasswordField: HTMLInputElement;
  newPasswordField: HTMLInputElement;
  submitNewPasswordButton: HTMLButtonElement;
  cancelPasswordChangeButton: HTMLButtonElement;
  passwordChangeApiResponseMessage: HTMLElement;
  passwordChangeSuccessMessage: HTMLElement;
}

const passwordUiElements: ElementSelectors<PasswordUiElements> = {
  changePasswordButton: '#change-password',
  viewPasswordSection: '#view-password-section',
  changePasswordForm: '#change-password-section',
  currentPasswordField: '#current-password-field',
  newPasswordField: '#new-password-field',
  submitNewPasswordButton: '#submit-new-password-button',
  cancelPasswordChangeButton: '#cancel-password-change-button',
  passwordChangeApiResponseMessage: '#password-change-api-response-message',
  passwordChangeSuccessMessage: '#password-change-success-message',
};

interface PlanUiElements extends UiElementsBase {
  changePlanButton: HTMLButtonElement;
  viewPlanSection: HTMLElement;
  currentPlanLabel: HTMLElement;
  changePlanSection: HTMLFormElement;
  currentCardField: HTMLElement;
  currentCardDescription: HTMLElement;
  planDropdown: HTMLSelectElement;
  submitNewPlanButton: HTMLButtonElement;
  cancelPlanChangeButton: HTMLButtonElement;
  planChangeApiResponseMessage: HTMLElement;
  planChangeSuccessMessage: HTMLElement;
  paymentSubformContainer: HTMLElement;
  paymentSubform: HTMLElement;
}

const planUiElements: ElementSelectors<PlanUiElements> = {
  changePlanButton: '#change-plan',
  viewPlanSection: '#view-plan-section',
  currentPlanLabel: '#current-plan-label',
  changePlanSection: '#change-plan-section',
  currentCardField: '#current-card-field',
  currentCardDescription: '#current-card-description',
  planDropdown: '#plans-dropdown',
  submitNewPlanButton: '#submit-new-plan-button',
  cancelPlanChangeButton: '#cancel-plan-change-button',
  planChangeApiResponseMessage: '#plan-change-api-response-message',
  planChangeSuccessMessage: '#plan-change-success-message',
  paymentSubformContainer: '#payment-subform-container',
  paymentSubform: '#payment-subform',
};

interface DeleteAccountUiElements {
  deleteAccountButton: HTMLButtonElement;
  deleteAccountSection: HTMLElement;
  deleteAccountConfirmationSection: HTMLFormElement;
  deleteAccountPasswordField: HTMLInputElement;
  deleteAccountSubmitButton: HTMLButtonElement;
  deleteAccountCancelButton: HTMLButtonElement;
  deleteAccountApiResponseMessage: HTMLElement;
  deleteAccountSuccessMessage: HTMLElement;
}

const deleteAccountUiElements: ElementSelectors<DeleteAccountUiElements> = {
  deleteAccountSection: '#delete-account-section',
  deleteAccountConfirmationSection: '#delete-account-confirmation-section',
  deleteAccountButton: '#delete-account-button',
  deleteAccountPasswordField: '#delete-account-password-field',
  deleteAccountSubmitButton: '#delete-account-submit-button',
  deleteAccountCancelButton: '#delete-account-cancel-button',
  deleteAccountApiResponseMessage: '#delete-account-api-response-message',
  deleteAccountSuccessMessage: '#delete-account-success-message',
};

main();
