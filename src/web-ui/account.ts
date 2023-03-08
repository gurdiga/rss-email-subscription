import { EmailChangeRequestData, UiAccount } from '../domain/account';
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
  preventDoubleClick,
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
    ...vewPasswordUiElements,
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

  addChangeEmailEventHandlers(uiElements, uiAccount);
  console.log('Hello account', { uiElements, uiAccount });
}

function addChangeEmailEventHandlers(
  uiElements: ViewEmailUiElements & ChangeEmailUiElements,
  _uiAccount: UiAccount
): void {
  const {
    changeEmailButton,
    viewEmailSection,
    changeEmailForm: changeEmailSection,
    cancelEmailChangeButton,
    submitNewEmailButton,
    newEmailField,
    emailChangeSuccessMessage: emailChangeConfirmationMessage,
  } = uiElements;

  changeEmailButton.addEventListener('click', () => {
    hideElement(viewEmailSection);
    unhideElement(changeEmailSection);
    newEmailField.focus();
  });

  cancelEmailChangeButton.addEventListener('click', () => {
    dismissChangeEmailForm(uiElements);
  });

  newEmailField.addEventListener(
    'keydown',
    ifEscape(() => dismissChangeEmailForm(uiElements))
  );

  submitNewEmailButton.addEventListener('click', () => {
    clearValidationErrors(uiElements);
    hideElement(emailChangeConfirmationMessage);

    preventDoubleClick(submitNewEmailButton, async () => {
      const response = await submitNewEmail(newEmailField.value);

      handleEmailChangeResponse(uiElements, response, newEmailField.value);
    });
  });
}

async function submitNewEmail(newEmail: string) {
  const request: EmailChangeRequestData = {
    newEmail: newEmail,
  };

  return await asyncAttempt(() => sendApiRequest('/account/change-email', HttpMethod.POST, request));
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
  return fillEmail(uiElements.currentEmailLabel, uiAccount.email);
}

function fillEmail(currentEmailLabel: HTMLElement, email: string) {
  return fillUiElements([
    {
      element: currentEmailLabel,
      propName: 'textContent',
      value: email,
    },
  ]);
}

async function loadUiAccount<T = UiAccount>(): Promise<Result<T>> {
  const response = await asyncAttempt(() => sendApiRequest<T>('/account'));

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

function ifEscape(f: Function) {
  return (event: KeyboardEvent) => {
    if (event.code === 'Escape') {
      f();
    }
  };
}

interface RequiredUiElements
  extends SpinnerUiElements,
    ViewEmailUiElements,
    ChangeEmailUiElements,
    VewPasswordUiElements {}

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

interface VewPasswordUiElements {
  changePasswordButton: HTMLButtonElement;
}

const vewPasswordUiElements: ElementSelectors<VewPasswordUiElements> = {
  changePasswordButton: '#change-password',
};

interface ChangePasswordUiElements {
  changePasswordForm: HTMLFormElement;
  currentPasswordField: HTMLInputElement;
  newPasswordField: HTMLInputElement;
  submitNewPasswordButton: HTMLButtonElement;
}

const changePasswordUiElements: ElementSelectors<ChangePasswordUiElements> = {
  changePasswordForm: '#change-password-section',
  currentPasswordField: '#current-password-field',
  newPasswordField: '#new-password-field',
  submitNewPasswordButton: '#submit-new-password-button',
};

main();
