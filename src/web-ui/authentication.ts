import { AuthenticationRequestData } from '../domain/account';
import { demoAccountEmail, demoAccountPassword } from '../domain/demo-account';
import { ApiPath } from '../domain/api-path';
import { PagePath, makePagePathWithParams } from '../domain/page-path';
import { isInputError, isSuccess } from '../shared/api-response';
import { asyncAttempt, isErr } from '../shared/lang';
import {
  apiResponseUiElements,
  ApiResponseUiElements,
  clearValidationErrors,
  displayApiResponse,
  displayCommunicationError,
  displayInitError,
  displayValidationError,
  HttpMethod,
  isAuthenticated,
  navigateTo,
  onInput,
  onSubmit,
  requireQueryParams,
  requireUiElements,
  sendApiRequest,
  toggleElement,
} from './shared';

function main() {
  if (isAuthenticated()) {
    location.href = PagePath.feedList;
    return;
  }

  const queryStringParams = requireQueryParams<Params>({
    demo: 'demo?',
  });

  if (isErr(queryStringParams)) {
    displayInitError(queryStringParams.reason);
    return;
  }

  const uiElements = requireUiElements<RequiredUiElements>({
    ...apiResponseUiElements,
    email: '#email',
    password: '#password',
    submitButton: '#submit-button',
    forgotPasswordLink: '#forgot-password-link',
    demoAccountMessage: '#demo-account-message',
  });

  if (isErr(uiElements)) {
    displayInitError(uiElements.reason);
    return;
  }

  initForm(uiElements);
  initForgotPasswordLink(uiElements);

  const isDemoLoginLink = queryStringParams.demo === '1';

  toggleElement(isDemoLoginLink, uiElements.demoAccountMessage);

  if (isDemoLoginLink) {
    uiElements.email.value = demoAccountEmail;
    uiElements.password.value = demoAccountPassword;
  }
}

function initForm(uiElements: RequiredUiElements): void {
  const { submitButton, email, password, apiResponseMessage, demoAccountMessage } = uiElements;

  onSubmit(submitButton, async (event: Event) => {
    event.preventDefault();
    clearValidationErrors(uiElements);

    const request: AuthenticationRequestData = {
      email: email.value,
      password: password.value,
    };
    const response = await asyncAttempt(() => sendApiRequest(ApiPath.authentication, HttpMethod.POST, request));

    if (isErr(response)) {
      displayCommunicationError(response, apiResponseMessage);
      return;
    }

    if (isInputError(response)) {
      displayValidationError(response, uiElements);
      return;
    }

    displayApiResponse(response, apiResponseMessage);

    if (isSuccess(response)) {
      navigateTo(PagePath.userStart, 1000);
    }
  });

  onInput(email, () => {
    const isDemoEmail = email.value.trim() === demoAccountEmail;

    toggleElement(isDemoEmail, demoAccountMessage);
  });
}

function initForgotPasswordLink(uiElements: RequiredUiElements): void {
  const { forgotPasswordLink, email } = uiElements;

  onInput(email, () => {
    forgotPasswordLink.href = makePagePathWithParams(PagePath.requestPasswordReset, { email: email.value });
  });
}

interface RequiredUiElements extends FormUiElements, ApiResponseUiElements {
  forgotPasswordLink: HTMLAnchorElement;
  demoAccountMessage: HTMLElement;
}

export interface FormFields {
  email: HTMLInputElement;
  password: HTMLInputElement;
}

export interface FormUiElements extends FormFields {
  submitButton: HTMLButtonElement;
}

interface Params {
  demo: string;
}

main();
