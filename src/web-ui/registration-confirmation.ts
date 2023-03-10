import { RegistrationConfirmationRequestData } from '../domain/account';
import { ApiPath } from '../domain/api-path';
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
  });

  if (isErr(uiElements)) {
    displayInitError(uiElements.reason);
    return;
  }

  unhideElement(uiElements.spinner);

  const response = await submitConfirmation(queryStringParams.secret);

  if (isErr(response)) {
    displayCommunicationError(response, uiElements.apiResponseMessage);
    return;
  }

  hideElement(uiElements.spinner);
  displayApiResponse(response, uiElements.apiResponseMessage);

  if (isSuccess(response)) {
    navigateTo(PagePath.userStart, 2000);
    return;
  }
}

async function submitConfirmation(secret: string) {
  const request: RegistrationConfirmationRequestData = { secret };

  return await asyncAttempt(() => sendApiRequest(ApiPath.registrationConfirmation, HttpMethod.POST, request));
}

interface RequiredParams {
  secret: string;
}

interface RequiredUiElements extends ApiResponseUiElements, SpinnerUiElements {}

main();
