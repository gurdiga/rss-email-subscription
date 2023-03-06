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
    planNameLabel: '#plan-name-label',
    emailLabel: '#email-label',
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

  // TODO
  // - Edit each of the sections
  console.log('Hello account', uiAccount);
}

function fillUi(uiElements: RequiredUiElements, uiAccount: UiAccount) {
  return fillUiElements([
    {
      element: uiElements.planNameLabel,
      propName: 'textContent',
      value: uiAccount.planName,
    },

    {
      element: uiElements.emailLabel,
      propName: 'textContent',
      value: uiAccount.email,
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

interface RequiredUiElements extends SpinnerUiElements {
  planNameLabel: HTMLElement;
  emailLabel: HTMLElement;
}

main();
