import { EmailChangeRequestData, PasswordChangeRequestData, PlanChangeRequestData, UiAccount } from '../domain/account';
import { ApiPath } from '../domain/api-path';
import { PlanId, Plans } from '../domain/plan';
import { ApiResponse, isAppError, isInputError, isSuccess } from '../shared/api-response';
import { asyncAttempt, isErr, makeErr, Result } from '../shared/lang';
import { si } from '../shared/string-utils';
import { createElement } from './dom-isolation';
import {
  clearValidationErrors,
  displayApiResponse,
  displayCommunicationError,
  displayInitError,
  displayValidationError,
  ElementSelectors,
  fillUiElements,
  hideElement,
  HttpMethod,
  onClick,
  onSubmit,
  requireUiElements,
  sendApiRequest,
  SpinnerUiElements,
  spinnerUiElements,
  unhideElement,
} from './shared';

async function main() {
  const uiElements = requireUiElements<RequiredUiElements>({
    ...spinnerUiElements,
    ...emailUiElements,
    ...passwordUiElements,
    ...planUiElements,
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
}

function addPlanChangeEventHandlers(uiElements: PlanUiElements, currentPlanId: PlanId): void {
  const {
    changePlanButton,
    cancelPlanChangeButton,
    submitNewPlanButton,
    viewPlanSection,
    changePlanForm,
    planChangeSuccessMessage,
    plansDropdown,
  } = uiElements;

  initPlansDropdown(plansDropdown, currentPlanId);

  onClick(changePlanButton, () => {
    hideElement(viewPlanSection);
    unhideElement(changePlanForm);
    plansDropdown.focus();
  });

  const dismissEditForm = () => {
    clearValidationErrors(uiElements);
    hideElement(planChangeSuccessMessage);
    hideElement(changePlanForm);
    unhideElement(viewPlanSection);
  };

  onClick(cancelPlanChangeButton, dismissEditForm);
  onEscape(plansDropdown, dismissEditForm);

  onSubmit(submitNewPlanButton, async () => {
    clearValidationErrors(uiElements);
    hideElement(planChangeSuccessMessage);
    await submitNewPlan(uiElements);
  });
}

function handleApiResponse(
  response: Result<ApiResponse<void>>,
  apiResponseMessage: HTMLElement,
  formFields: Record<string, HTMLElement>,
  onSuccess: () => void
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
    onSuccess();
  }
}

async function submitNewPlan(uiElements: PlanUiElements) {
  const { currentPlanLabel, plansDropdown, planChangeApiResponseMessage, planChangeSuccessMessage } = uiElements;
  const newPlanId = plansDropdown.value as PlanId;
  const request: PlanChangeRequestData = { planId: newPlanId };
  const response = await asyncAttempt(() => sendApiRequest(ApiPath.requestAccountPlanChange, HttpMethod.POST, request));

  handleApiResponse(
    response,
    planChangeApiResponseMessage,
    {
      planId: plansDropdown,
    },
    () => {
      const newPlanTitle = Plans[newPlanId].title;

      unhideElement(planChangeSuccessMessage);
      currentPlanLabel.textContent = newPlanTitle;
    }
  );
}

function initPlansDropdown(plansDropdown: HTMLSelectElement, currentPlanId: PlanId) {
  const planOptions = Object.entries(Plans)
    .filter(([id]) => id !== PlanId.SDE)
    .map(([id, { title }]) =>
      createElement('option', title, {
        value: id,
        ...(currentPlanId === id ? { selected: 'selected' } : {}),
      })
    );

  plansDropdown.replaceChildren(...planOptions);
}

function addPasswordChangeEventHandlers(uiElements: PasswordUiElements): void {
  const {
    changePasswordButton,
    viewPasswordSection,
    changePasswordForm,
    currentPasswordField,
    submitNewPasswordButton,
    cancelPasswordChangeButton,
    passwordChangeSuccessMessage,
  } = uiElements;

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
  const { currentPasswordField, newPasswordField, passwordChangeSuccessMessage, passwordChangeApiResponseMessage } =
    uiElements;
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
  const {
    changeEmailButton,
    viewEmailSection,
    changeEmailForm,
    cancelEmailChangeButton,
    submitNewEmailButton,
    newEmailField,
    emailChangeSuccessMessage,
  } = uiElements;

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
  return fillUiElements([
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

interface RequiredUiElements extends SpinnerUiElements, EmailUiElements, PasswordUiElements, PlanUiElements {}

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

interface PlanUiElements {
  changePlanButton: HTMLButtonElement;
  viewPlanSection: HTMLElement;
  currentPlanLabel: HTMLElement;
  changePlanForm: HTMLFormElement;
  plansDropdown: HTMLSelectElement;
  submitNewPlanButton: HTMLButtonElement;
  cancelPlanChangeButton: HTMLButtonElement;
  planChangeApiResponseMessage: HTMLElement;
  planChangeSuccessMessage: HTMLElement;
}

const planUiElements: ElementSelectors<PlanUiElements> = {
  changePlanButton: '#change-plan',
  viewPlanSection: '#view-plan-section',
  currentPlanLabel: '#current-plan-label',
  changePlanForm: '#change-plan-section',
  plansDropdown: '#plans-dropdown',
  submitNewPlanButton: '#submit-new-plan-button',
  cancelPlanChangeButton: '#cancel-plan-change-button',
  planChangeApiResponseMessage: '#plan-change-api-response-message',
  planChangeSuccessMessage: '#plan-change-success-message',
};

main();
