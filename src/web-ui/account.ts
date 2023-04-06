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
    ...viewEmailUiElements,
    ...changeEmailUiElements,
    ...viewPasswordUiElements,
    ...changePasswordUiElements,
    ...viewPlanUiElements,
    ...changePlanUiElements,
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

function addPlanChangeEventHandlers(
  uiElements: ViewPlanUiElements & ChangePlanUiElements,
  currentPlanId: PlanId
): void {
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
    hideElement(uiElements.planChangeSuccessMessage);
    hideElement(uiElements.changePlanForm);
    unhideElement(uiElements.viewPlanSection);
  };

  onClick(cancelPlanChangeButton, dismissEditForm);
  onEscape(plansDropdown, dismissEditForm);

  onSubmit(submitNewPlanButton, async () => {
    clearValidationErrors(uiElements);
    hideElement(planChangeSuccessMessage);

    const response = await submitNewPlan(plansDropdown.value);

    handlePlanChangeResponse(uiElements, response);
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

// TODO: Consider DRYing out this and the other handle*ChangeResponse functions
function handlePlanChangeResponse(
  uiElements: ViewPlanUiElements & ChangePlanUiElements,
  response: Result<ApiResponse<void>>
): void {
  handleApiResponse(
    response,
    uiElements.planChangeApiResponseMessage,
    {
      planId: uiElements.plansDropdown,
    },
    () => {
      const newPlanId = uiElements.plansDropdown.value as PlanId;
      const newPlanTitle = Plans[newPlanId].title;

      unhideElement(uiElements.planChangeSuccessMessage);
      uiElements.currentPlanLabel.textContent = newPlanTitle;
    }
  );
}

async function submitNewPlan(planId: string) {
  const request: PlanChangeRequestData = { planId };

  return await asyncAttempt(() => sendApiRequest(ApiPath.requestAccountPlanChange, HttpMethod.POST, request));
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

function addPasswordChangeEventHandlers(uiElements: ViewPasswordUiElements & ChangePasswordUiElements): void {
  const {
    changePasswordButton,
    viewPasswordSection,
    changePasswordForm,
    currentPasswordField,
    newPasswordField,
    submitNewPasswordButton,
    cancelPasswordChangeButton,
    passwordChangeSuccessMessage,
  } = uiElements;

  onClick(changePasswordButton, () => {
    hideElement(viewPasswordSection);
    unhideElement(changePasswordForm);
    currentPasswordField.focus();
  });

  onClick(cancelPasswordChangeButton, () => {
    dismissChangePasswordForm(uiElements);
  });

  onEscape(changePasswordForm, () => dismissChangePasswordForm(uiElements));

  onSubmit(submitNewPasswordButton, async () => {
    clearValidationErrors(uiElements);
    hideElement(passwordChangeSuccessMessage);

    const response = await submitNewPassword(currentPasswordField.value, newPasswordField.value);

    handlePasswordChangeResponse(uiElements, response);
  });
}

function handlePasswordChangeResponse(
  uiElements: ViewPasswordUiElements & ChangePasswordUiElements,
  response: Result<ApiResponse<void>>
): void {
  handleApiResponse(
    response,
    uiElements.passwordChangeApiResponseMessage,
    {
      currentPassword: uiElements.currentPasswordField,
      newPassword: uiElements.newPasswordField,
    },
    () => {
      unhideElement(uiElements.passwordChangeSuccessMessage);
      uiElements.currentPasswordField.value = '';
      uiElements.newPasswordField.value = '';
    }
  );
}

async function submitNewPassword(currentPassword: string, newPassword: string) {
  const request: PasswordChangeRequestData = { currentPassword, newPassword };

  return await asyncAttempt(() => sendApiRequest(ApiPath.requestAccountPasswordChange, HttpMethod.POST, request));
}

function dismissChangePasswordForm(uiElements: ViewPasswordUiElements & ChangePasswordUiElements): void {
  clearValidationErrors(uiElements);
  hideElement(uiElements.passwordChangeSuccessMessage);
  hideElement(uiElements.changePasswordForm);
  unhideElement(uiElements.viewPasswordSection);
}

function addEmailChangeEventHandlers(uiElements: ViewEmailUiElements & ChangeEmailUiElements): void {
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

  onClick(cancelEmailChangeButton, () => dismissChangeEmailForm(uiElements));
  onEscape(newEmailField, () => dismissChangeEmailForm(uiElements));

  onSubmit(submitNewEmailButton, async () => {
    clearValidationErrors(uiElements);
    hideElement(emailChangeSuccessMessage);

    const response = await submitNewEmail(newEmailField.value);

    handleEmailChangeResponse(uiElements, response, newEmailField.value);
  });
}

async function submitNewEmail(newEmail: string) {
  const request: EmailChangeRequestData = { newEmail };

  return await asyncAttempt(() => sendApiRequest(ApiPath.requestAccountEmailChange, HttpMethod.POST, request));
}

function handleEmailChangeResponse(
  uiElements: ViewEmailUiElements & ChangeEmailUiElements,
  response: Result<ApiResponse<void>>,
  newEmail: string
): void {
  handleApiResponse(
    response,
    uiElements.emailChangeApiResponseMessage,
    {
      newEmail: uiElements.newEmailField,
    },
    () => {
      unhideElement(uiElements.emailChangeSuccessMessage);
      uiElements.newEmailLabel.textContent = newEmail;
      uiElements.newEmailField.value = '';
    }
  );
}

function dismissChangeEmailForm(uiElements: ViewEmailUiElements & ChangeEmailUiElements): void {
  clearValidationErrors(uiElements);
  hideElement(uiElements.emailChangeSuccessMessage);
  hideElement(uiElements.changeEmailForm);
  unhideElement(uiElements.viewEmailSection);
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

interface RequiredUiElements
  extends SpinnerUiElements,
    ViewEmailUiElements,
    ChangeEmailUiElements,
    ViewPasswordUiElements,
    ChangePasswordUiElements,
    ViewPlanUiElements,
    ChangePlanUiElements {}

interface ViewEmailUiElements {
  viewEmailSection: HTMLElement;
  currentEmailLabel: HTMLElement;
  changeEmailButton: HTMLButtonElement;
}

const viewEmailUiElements: ElementSelectors<ViewEmailUiElements> = {
  viewEmailSection: '#view-email-section',
  currentEmailLabel: '#current-email-label',
  changeEmailButton: '#change-email-button',
};

interface ChangeEmailUiElements {
  changeEmailForm: HTMLFormElement;
  newEmailField: HTMLInputElement;
  newEmailLabel: HTMLElement;
  submitNewEmailButton: HTMLButtonElement;
  cancelEmailChangeButton: HTMLButtonElement;
  emailChangeApiResponseMessage: HTMLElement;
  emailChangeSuccessMessage: HTMLElement;
}

const changeEmailUiElements: ElementSelectors<ChangeEmailUiElements> = {
  changeEmailForm: '#change-email-section',
  newEmailField: '#new-email-field',
  newEmailLabel: '#new-email-label',
  submitNewEmailButton: '#submit-new-email-button',
  cancelEmailChangeButton: '#cancel-email-change-button',
  emailChangeApiResponseMessage: '#email-change-api-response-message',
  emailChangeSuccessMessage: '#email-change-success-message',
};

interface ViewPasswordUiElements {
  changePasswordButton: HTMLButtonElement;
  viewPasswordSection: HTMLElement;
}

const viewPasswordUiElements: ElementSelectors<ViewPasswordUiElements> = {
  changePasswordButton: '#change-password',
  viewPasswordSection: '#view-password-section',
};

interface ChangePasswordUiElements {
  changePasswordForm: HTMLFormElement;
  currentPasswordField: HTMLInputElement;
  newPasswordField: HTMLInputElement;
  submitNewPasswordButton: HTMLButtonElement;
  cancelPasswordChangeButton: HTMLButtonElement;
  passwordChangeApiResponseMessage: HTMLElement;
  passwordChangeSuccessMessage: HTMLElement;
}

const changePasswordUiElements: ElementSelectors<ChangePasswordUiElements> = {
  changePasswordForm: '#change-password-section',
  currentPasswordField: '#current-password-field',
  newPasswordField: '#new-password-field',
  submitNewPasswordButton: '#submit-new-password-button',
  cancelPasswordChangeButton: '#cancel-password-change-button',
  passwordChangeApiResponseMessage: '#password-change-api-response-message',
  passwordChangeSuccessMessage: '#password-change-success-message',
};

interface ViewPlanUiElements {
  changePlanButton: HTMLButtonElement;
  viewPlanSection: HTMLElement;
  currentPlanLabel: HTMLElement;
}

const viewPlanUiElements: ElementSelectors<ViewPlanUiElements> = {
  changePlanButton: '#change-plan',
  viewPlanSection: '#view-plan-section',
  currentPlanLabel: '#current-plan-label',
};

interface ChangePlanUiElements {
  changePlanForm: HTMLFormElement;
  plansDropdown: HTMLSelectElement;
  submitNewPlanButton: HTMLButtonElement;
  cancelPlanChangeButton: HTMLButtonElement;
  planChangeApiResponseMessage: HTMLElement;
  planChangeSuccessMessage: HTMLElement;
}

const changePlanUiElements: ElementSelectors<ChangePlanUiElements> = {
  changePlanForm: '#change-plan-section',
  plansDropdown: '#plans-dropdown',
  submitNewPlanButton: '#submit-new-plan-button',
  cancelPlanChangeButton: '#cancel-plan-change-button',
  planChangeApiResponseMessage: '#plan-change-api-response-message',
  planChangeSuccessMessage: '#plan-change-success-message',
};

main();
