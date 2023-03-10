import { EmailChangeConfirmationRequestData } from '../domain/account';
import { PagePath } from '../domain/page-path';
import { isSuccess } from '../shared/api-response';
import { asyncAttempt, isErr } from '../shared/lang';
import {
  apiResponseUiElements,
  ApiResponseUiElements,
  displayApiResponse,
  displayCommunicationError,
  displayInitError,
  hideElement,
  HttpMethod,
  navigateTo,
  requireQueryParams,
  requireUiElements,
  sendApiRequest,
  SpinnerUiElements,
  spinnerUiElements,
  unhideElement,
} from './shared';

async function main() {
  const queryStringParams = requireQueryParams<RequiredParams>({
    secret: 'secret',
  });

  if (isErr(queryStringParams)) {
    displayInitError(queryStringParams.reason);
    return;
  }

  const uiElements = requireUiElements<RequiredUiElements>({
    ...spinnerUiElements,
    ...apiResponseUiElements,
    successMessage: '#success-message',
    redirectTimeout: '#redirect-timeout',
  });

  if (isErr(uiElements)) {
    displayInitError(uiElements.reason);
    return;
  }

  const response = await submitConfirmation(queryStringParams.secret);

  if (isErr(response)) {
    displayCommunicationError(response.reason, uiElements.apiResponseMessage);
    return;
  }

  hideElement(uiElements.spinner);

  if (!isSuccess(response)) {
    displayApiResponse(response, uiElements.apiResponseMessage);
    return;
  }

  const deauthenticationResponse = await asyncAttempt(() => sendApiRequest('/deauthentication', HttpMethod.POST));

  if (isErr(deauthenticationResponse)) {
    displayApiResponse(response, uiElements.apiResponseMessage);
    return;
  }

  const timeoutSeconds = 5;

  unhideElement(uiElements.successMessage);
  uiElements.redirectTimeout.textContent = timeoutSeconds.toString();
  navigateTo(PagePath.userAuthentication, timeoutSeconds * 1000);
}

async function submitConfirmation(secret: string) {
  const request: EmailChangeConfirmationRequestData = { secret };

  return await asyncAttempt(() => sendApiRequest('/account/confirm-change-email', HttpMethod.POST, request));
}

interface RequiredParams {
  secret: string;
}

interface RequiredUiElements extends ApiResponseUiElements, SpinnerUiElements {
  successMessage: HTMLElement;
  redirectTimeout: HTMLElement;
}

main();
