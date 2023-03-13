import { EmailChangeRequestData, PasswordChangeRequestData, UiAccount } from '../domain/account';
import { ApiPath } from '../domain/api-path';
import { ApiResponse, isAppError, isInputError, isSuccess } from '../shared/api-response';
import { asyncAttempt, isErr, makeErr, Result } from '../shared/lang';
import { si } from '../shared/string-utils';
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
  if (isErr(response)) {
    displayCommunicationError(response, uiElements.passwordChangeApiResponseMessage);
    return;
  }

  if (isAppError(response)) {
    displayApiResponse(response, uiElements.passwordChangeApiResponseMessage);
    return;
  }

  if (isInputError(response)) {
    displayValidationError(response, {
      currentPassword: uiElements.currentPasswordField,
      newPassword: uiElements.newPasswordField,
    });
    return;
  }

  if (isSuccess(response)) {
    unhideElement(uiElements.passwordChangeSuccessMessage);
    uiElements.currentPasswordField.value = '';
    uiElements.newPasswordField.value = '';
  }
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
  if (isErr(response)) {
    displayCommunicationError(response, uiElements.emailChangeApiResponseMessage);
    return;
  }

  if (isAppError(response)) {
    displayApiResponse(response, uiElements.emailChangeApiResponseMessage);
    return;
  }

  if (isInputError(response)) {
    displayValidationError(response, { newEmail: uiElements.newEmailField });
    return;
  }

  if (isSuccess(response)) {
    unhideElement(uiElements.emailChangeSuccessMessage);
    uiElements.newEmailLabel.textContent = newEmail;
    uiElements.newEmailField.value = '';
  }
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
    ChangePasswordUiElements {}

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

main();
