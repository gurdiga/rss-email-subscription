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
    changeEmailSection,
    cancelEmailChangeButton,
    submitNewEmailButton,
    newEmailField,
  } = uiElements;

  changeEmailButton.addEventListener('click', () => {
    hideElement(viewEmailSection);
    unhideElement(changeEmailSection);
  });

  cancelEmailChangeButton.addEventListener('click', () => {
    displaViewEmailSection(uiElements);
  });

  submitNewEmailButton.addEventListener('click', () => {
    clearValidationErrors(uiElements);
    hideElement(uiElements.emailChangeConfirmationMessage);

    preventDoubleClick(submitNewEmailButton, async () => {
      const response = await submitNewEmail(newEmailField.value);

      handleEmailChangeResponse(uiElements, response);
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
  response: Result<ApiResponse<void>>
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
    unhideElement(uiElements.emailChangeConfirmationMessage);
  }
}

function displaViewEmailSection({
  changeEmailSection,
  viewEmailSection,
}: ViewEmailUiElements & ChangeEmailUiElements): void {
  hideElement(changeEmailSection);
  unhideElement(viewEmailSection);
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

export async function loadUiAccount<T = UiAccount>(): Promise<Result<T>> {
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
  changeEmailSection: HTMLElement;
  newEmailField: HTMLInputElement;
  submitNewEmailButton: HTMLButtonElement;
  cancelEmailChangeButton: HTMLButtonElement;
  emailChangeApiResponseMessage: HTMLElement;
  emailChangeConfirmationMessage: HTMLElement;
}

const changeEmailUiElements: ElementSelectors<ChangeEmailUiElements> = {
  changeEmailSection: '#change-email-section',
  newEmailField: '#new-email-field',
  submitNewEmailButton: '#submit-new-email-button',
  cancelEmailChangeButton: '#cancel-email-change-button',
  emailChangeApiResponseMessage: '#email-change-api-response-message',
  emailChangeConfirmationMessage: '#email-change-confirmation-message',
};

interface VewPasswordUiElements {
  changePasswordButton: HTMLButtonElement;
}

const vewPasswordUiElements: ElementSelectors<VewPasswordUiElements> = {
  changePasswordButton: '#change-password',
};

interface ChangePasswordUiElements {
  changePasswordSection: HTMLElement;
  currentPasswordField: HTMLInputElement;
  newPasswordField: HTMLInputElement;
  submitNewPasswordButton: HTMLButtonElement;
}

const changePasswordUiElements: ElementSelectors<ChangePasswordUiElements> = {
  changePasswordSection: '#change-password-section',
  currentPasswordField: '#current-password-field',
  newPasswordField: '#new-password-field',
  submitNewPasswordButton: '#submit-new-password-button',
};

main();
