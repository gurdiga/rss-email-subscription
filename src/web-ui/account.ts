import { UiAccount } from '../domain/account';
import { isAppError, isInputError } from '../shared/api-response';
import { asyncAttempt, isErr, makeErr, Result } from '../shared/lang';
import { si } from '../shared/string-utils';
import {
  displayInitError,
  fillUiElements,
  requireUiElements,
  sendApiRequest,
  SpinnerUiElements,
  spinnerUiElements,
} from './shared';

async function main() {
  const uiElements = requireUiElements<RequiredUiElements>({
    ...spinnerUiElements,
    emailLabel: '#email-label',
    changeEmailButton: '#change-email',
    changePasswordButton: '#change-password',
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

  const fillUiResult = fillUiElements([
    {
      element: uiElements.emailLabel,
      propName: 'textContent',
      value: uiAccount.email,
    },
  ]);

  if (isErr(fillUiResult)) {
    displayInitError(fillUiResult.reason);
    return;
  }

  bindChangePlanButton(uiElements, uiAccount);

  // TODO
  // - Edit each of the sections
  console.log('Hello account', uiAccount);
}

function bindChangePlanButton(_uiElements: RequiredUiElements, _uiAccount: UiAccount): void {
  // TODO: Add planId to UiAccount to be able to pre-select it in the dropdown.
  // TODO: Prep the edit form markup, and unhide it here.
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

interface RequiredUiElements extends EmailUiElements, PasswordUiElements, SpinnerUiElements {}

interface EmailUiElements {
  emailLabel: HTMLElement;
  changeEmailButton: HTMLButtonElement;
  // TODO: Add edit form elements.
}

interface PasswordUiElements {
  changePasswordButton: HTMLButtonElement;
  // TODO: Add edit form elements.
}

main();
